import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { asc } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { notificationListResponseSchema } from '../src/features/notifications/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import { notifications, users } from '../src/server/db/schema';

const SECRET = 'test-messaging-channel-secret';
const ACCESS_TOKEN = 'test-messaging-access-token';
const NO_NOTIFICATION_TEXT = 'お知らせはありません。';
const NO_UNREAD_TEXT = '未読のお知らせはありません。';
const FAILURE_TEXT = 'お知らせを取得できませんでした。時間をおいて、もう一度お試しください。';
const SELF = { id: 'user-self', lineUserId: 'U-self' };
const OTHER = { id: 'user-other', lineUserId: 'U-other' };

const fetchMock = vi.fn<typeof fetch>();
// Sentry が console.error を包み直すため、呼び出しは差し込んだモックで観測する
const errorLog = vi.fn<typeof console.error>();

beforeEach(async () => {
  const db = createDb(env.DB);
  await db.delete(notifications);
  await db.delete(users);
  await db.insert(users).values([
    { ...SELF, displayName: '本人' },
    { ...OTHER, displayName: '他人' },
  ]);
  fetchMock.mockImplementation(async () => Response.json({}));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(errorLog);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

/** お知らせの操作イベントを作る。 */
function announcementsEvent(userId = SELF.lineUserId) {
  return {
    type: 'postback',
    webhookEventId: 'event-announcements',
    replyToken: 'reply-token-announcements',
    deliveryContext: { isRedelivery: false },
    source: { type: 'user', userId },
    postback: { data: 'action=announcements' },
  };
}

/** イベントを正しい署名で送り、バックグラウンドの返信完了まで待つ。 */
async function deliver(event: unknown): Promise<void> {
  const body = JSON.stringify({ events: [event] });
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const ctx = createExecutionContext();
  const response = await app.fetch(
    new Request('https://example.com/api/line/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-line-signature': btoa(String.fromCharCode(...new Uint8Array(signature))),
      },
      body,
    }),
    {
      ...env,
      LINE_MESSAGING_CHANNEL_SECRET: SECRET,
      LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: ACCESS_TOKEN,
    },
    ctx,
  );
  await waitOnExecutionContext(ctx);
  expect(response.status).toBe(200);
}

const textMessageSchema = z.strictObject({ type: z.literal('text'), text: z.string() });
const noticeSchema = z.object({
  contents: z.tuple([
    z.object({ text: z.string() }),
    z.object({ text: z.string() }),
    z.object({ text: z.string() }),
  ]),
});
const flexMessageSchema = z.object({
  type: z.literal('flex'),
  altText: z.string(),
  contents: z.object({
    type: z.literal('bubble'),
    body: z.object({ contents: z.array(z.unknown()) }),
  }),
});
const replySchema = z.object({
  replyToken: z.literal('reply-token-announcements'),
  messages: z.tuple([z.union([textMessageSchema, flexMessageSchema])]),
});

/** お知らせの操作を送り、一回だけ届いた返信メッセージを返す。 */
async function requestAnnouncements() {
  fetchMock.mockClear();
  await deliver(announcementsEvent());
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [message] = replySchema.parse(
    JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
  ).messages;
  return message;
}

/** 返信されたカードの、代替テキストと通知ごとのタイトルを返す。 */
async function requestTitles() {
  const message = await requestAnnouncements();
  if (message.type !== 'flex') throw new Error('Flex Message ではありません');
  const titles = message.contents.body.contents.flatMap((component) => {
    const notice = noticeSchema.safeParse(component);
    return notice.success ? [notice.data.contents[0].text] : [];
  });
  return { altText: message.altText, titles };
}

/** 順序を指定できる固定の通知 ID。`sequence` が大きいほど ID の順で後になる。 */
function notificationId(sequence: number): string {
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

/** 作成日時と ID を指定して通知を入れる。件名は `件名<sequence>` になる。 */
async function insertNotification(
  userId: string,
  sequence: number,
  overrides: Partial<typeof notifications.$inferInsert> = {},
): Promise<void> {
  await createDb(env.DB)
    .insert(notifications)
    .values({
      id: notificationId(sequence),
      userId,
      title: `件名${sequence}`,
      body: `本文${sequence}`,
      actionUrl: '/private-action',
      eventKey: `event-${sequence}`,
      createdAt: new Date('2026-11-01T00:00:00Z'),
      ...overrides,
    });
}

function selectNotifications() {
  return createDb(env.DB).select().from(notifications).orderBy(asc(notifications.id));
}

/** 本人として Web の通知 API を呼ぶ。 */
async function requestWeb(path: string, method = 'GET'): Promise<Response> {
  const token = await signJwt(
    { userId: SELF.id, displayName: '本人', role: 'MEMBER', isActive: true },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN,
  );
  const response = await app.request(
    path,
    { method, headers: { cookie: `auth-token=${token}`, 'sec-fetch-site': 'same-origin' } },
    env,
  );
  expect(response.status).toBe(200);
  return response;
}

describe('LINE のお知らせの返信', () => {
  it('インストラクター未紐付けの本人に、本人宛ての未読だけをリンクなしで一回返信する', async () => {
    await insertNotification(SELF.id, 1, { createdAt: new Date('2026-11-27T23:15:00Z') });
    await insertNotification(SELF.id, 2, { readAt: new Date('2026-11-02T00:00:00Z') });
    await insertNotification(OTHER.id, 3, { title: 'private-other-title' });

    expect(await requestTitles()).toEqual({
      altText: 'お知らせ（未読1件）',
      titles: ['件名1'],
    });
    const sent = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(sent).toContain('11/28（土）08:15');
    expect(sent).toContain('本文1');
    expect(sent).not.toContain('private-');
    expect(sent).not.toContain('"uri"');
    expect(sent).not.toContain('actionUrl');
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('新しい順（同じ秒は ID の降順）に最大5件を返し、順序と未読総数は Web と一致する', async () => {
    const sameSecond = new Date('2026-11-10T00:00:00Z');
    // 登録順と表示順が一致しないようにする
    await insertNotification(SELF.id, 3, { createdAt: sameSecond });
    await insertNotification(SELF.id, 8, { createdAt: new Date('2026-11-01T00:00:00Z') });
    await insertNotification(SELF.id, 5, { createdAt: sameSecond });
    await insertNotification(SELF.id, 1, { createdAt: new Date('2026-11-20T00:00:00Z') });
    await insertNotification(SELF.id, 4, { createdAt: sameSecond });
    await insertNotification(SELF.id, 7, { createdAt: new Date('2026-11-02T00:00:00Z') });
    await insertNotification(SELF.id, 6, { createdAt: new Date('2026-11-03T00:00:00Z') });
    await insertNotification(SELF.id, 2, { createdAt: new Date('2026-11-09T00:00:00Z') });
    await insertNotification(SELF.id, 9, {
      createdAt: new Date('2026-11-25T00:00:00Z'),
      readAt: new Date('2026-11-26T00:00:00Z'),
    });
    await insertNotification(OTHER.id, 10, { createdAt: new Date('2026-11-25T00:00:00Z') });

    const { altText, titles } = await requestTitles();
    const response = await requestWeb('/api/notifications/me?unreadOnly=true&limit=5');
    const page = notificationListResponseSchema.parse(await response.json());

    expect(titles).toEqual(['件名1', '件名5', '件名4', '件名3', '件名2']);
    expect(altText).toBe('お知らせ（未読8件のうち最新5件を表示）');
    expect(page.items.map((item) => item.title)).toEqual(titles);
    expect(page.unreadCount).toBe(8);
  });

  it('照会の前後で readAt を変えない', async () => {
    await insertNotification(SELF.id, 1);
    await insertNotification(SELF.id, 2, { readAt: new Date('2026-11-02T00:00:00Z') });
    await insertNotification(OTHER.id, 3);
    const before = await selectNotifications();

    await requestAnnouncements();
    await requestAnnouncements();

    expect(await selectNotifications()).toEqual(before);
  });

  it('Web の既読操作を次の照会に反映する', async () => {
    await insertNotification(SELF.id, 1);
    await insertNotification(SELF.id, 2);
    expect((await requestTitles()).titles).toEqual(['件名2', '件名1']);

    await requestWeb(`/api/notifications/${notificationId(2)}/read`, 'PUT');
    expect(await requestTitles()).toEqual({ altText: 'お知らせ（未読1件）', titles: ['件名1'] });

    await requestWeb(`/api/notifications/${notificationId(1)}/read`, 'PUT');
    expect(await requestAnnouncements()).toEqual({ type: 'text', text: NO_UNREAD_TEXT });
  });

  it('本人の通知がなければ、他人の通知があっても0件と返す', async () => {
    await insertNotification(OTHER.id, 1);

    expect(await requestAnnouncements()).toEqual({ type: 'text', text: NO_NOTIFICATION_TEXT });
  });

  it('通知の読み取りに失敗した場合は取得失敗を返し、固定の内容だけを記録する', async () => {
    await insertNotification(SELF.id, 1);
    // 認可は batch を使わないため、認可後の通知の読み取りだけが失敗する
    const batch = vi
      .spyOn(env.DB, 'batch')
      .mockRejectedValueOnce(new Error('private-d1-error user-self'));

    const message = await requestAnnouncements();

    expect(batch).toHaveBeenCalledTimes(1);
    expect(message).toEqual({ type: 'text', text: FAILURE_TEXT });
    expect(errorLog.mock.calls).toEqual([
      ['[line-webhook] announcements failed', { kind: 'db_error' }],
    ]);
  });

  it.each<[string, Partial<typeof users.$inferInsert> | null]>([
    ['未登録', null],
    ['無効', { isActive: false }],
    ['未知のロール', { role: 'OWNER' }],
  ])('%sのユーザーには通知を取得せず返信しない', async (_label, values) => {
    if (values) {
      await createDb(env.DB)
        .insert(users)
        .values({ id: 'user-target', lineUserId: 'U-target', displayName: '対象', ...values });
      await insertNotification('user-target', 1);
    }
    const batch = vi.spyOn(env.DB, 'batch');

    await deliver(announcementsEvent('U-target'));

    expect(batch).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
  });

  it.each<[string, Record<string, unknown>]>([
    ['グループ', { source: { type: 'group', groupId: 'G', userId: SELF.lineUserId } }],
    ['複数人トーク', { source: { type: 'room', roomId: 'R', userId: SELF.lineUserId } }],
    ['再配信', { deliveryContext: { isRedelivery: true } }],
    ['通常メッセージ', { type: 'message', message: { type: 'text', text: 'お知らせ' } }],
  ])('%sには通知を取得せず返信しない', async (_label, overrides) => {
    await insertNotification(SELF.id, 1);
    const prepare = vi.spyOn(env.DB, 'prepare');

    await deliver({ ...announcementsEvent(), ...overrides });

    expect(prepare).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import app from '../src/index';
import { createDb } from '../src/server/db/client';
import {
  certificationRequirements,
  certifications,
  departmentShiftTypes,
  instructorCertifications,
  instructors,
  shiftAssignments,
  shifts,
  shiftTypes,
  users,
} from '../src/server/db/schema';

const SECRET = 'test-messaging-channel-secret';
const ACCESS_TOKEN = 'test-messaging-access-token';
const REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply';
/** 日本時間では 2026-11-28 の 0 時（UTC では前日） */
const NOW = new Date('2026-11-27T15:00:00.000Z');
const EMPTY_TEXT = '全体の勤務予定（11/28（土）〜12/4（金））\nこの期間の勤務予定はありません。';
const UNLINKED_TEXT = 'インストラクター情報が紐付いていないため、勤務予定を確認できません。';
const NO_UPCOMING_TEXT = '今後の勤務予定はありません';

/** 受信側の設定（未指定の項目はテストの既定値、undefined は未設定を表す） */
type Settings = {
  secret?: string | undefined;
  accessToken?: string | undefined;
};

const { captureException } = vi.hoisted(() => {
  vi.resetModules();
  return { captureException: vi.fn() };
});

vi.mock('@sentry/cloudflare', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/cloudflare')>()),
  captureException,
}));

const fetchMock = vi.fn<typeof fetch>();
const dbAccess = vi.fn();
// Sentry が console.error を包み直すため、呼び出しは差し込んだモックで観測する
const errorLog = vi.fn<typeof console.error>();

beforeEach(async () => {
  const db = createDb(env.DB);
  await db.delete(shiftAssignments);
  await db.delete(shifts);
  await db.delete(certificationRequirements);
  await db.delete(departmentShiftTypes);
  await db.delete(instructorCertifications);
  await db.delete(certifications);
  await db.delete(users);
  await db.delete(instructors);
  await db.delete(shiftTypes);
  await db.insert(users).values({ lineUserId: 'U-private', displayName: '返信対象' });
  vi.setSystemTime(NOW);
  fetchMock.mockImplementation(async () => Response.json({}));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(errorLog);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

/** 本文の HMAC-SHA256 署名を Base64 で作る。 */
async function sign(body: string | Uint8Array<ArrayBuffer>, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  const signature = await crypto.subtle.sign('HMAC', key, bytes);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/** 本番と同じアプリに Webhook を送る。D1 バインディングの参照は `dbAccess` に記録する。 */
async function post(
  body: string | Uint8Array<ArrayBuffer>,
  signature: string | null,
  settings: Settings = {},
) {
  const { secret, accessToken } = {
    secret: SECRET,
    accessToken: ACCESS_TOKEN,
    ...settings,
  };
  const requestEnv = {
    ...env,
    LINE_MESSAGING_CHANNEL_SECRET: secret,
    LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: accessToken,
    get DB() {
      dbAccess();
      return env.DB;
    },
  };
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  if (signature !== null) headers.set('x-line-signature', signature);
  const ctx = createExecutionContext();
  const response = await app.fetch(
    new Request('https://example.com/api/line/webhook', { method: 'POST', headers, body }),
    requestEnv,
    ctx,
  );
  return { response, ctx };
}

/** 本文に正しい署名を付けて送り、バックグラウンドの返信完了まで待つ。 */
async function deliverRaw(body: string | Uint8Array<ArrayBuffer>, settings: Settings = {}) {
  const { response, ctx } = await post(body, await sign(body), settings);
  await waitOnExecutionContext(ctx);
  return response;
}

/** イベント一覧を正しい署名で送り、バックグラウンドの返信完了まで待つ。 */
function deliver(events: unknown[], settings: Settings = {}) {
  return deliverRaw(JSON.stringify({ destination: 'bot', events }), settings);
}

/** 返信対象となる全体の勤務予定の操作イベントを作る。 */
function scheduleEvent(id: string, userId = 'U-private') {
  return {
    type: 'postback',
    webhookEventId: id,
    replyToken: `reply-token-${id}`,
    deliveryContext: { isRedelivery: false },
    source: { type: 'user', userId },
    postback: { data: 'action=team-schedule' },
  };
}

/** 返信対象となる直近の勤務予定の操作イベントを作る。 */
function myScheduleEvent(id: string, userId = 'U-private') {
  return { ...scheduleEvent(id, userId), postback: { data: 'action=my-schedule' } };
}

/** Reply API に送った JSON 本文の一覧を返す。 */
function sentReplies(): unknown[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
}

/** 勤務がない場合の、イベント ID に対応する期待する返信本文を作る。 */
function reply(id: string) {
  return { replyToken: `reply-token-${id}`, messages: [{ type: 'text', text: EMPTY_TEXT }] };
}

/** 返信先の順に依存せず比較するため、Reply token の順に並べる。 */
function sortedReplies() {
  return sentReplies()
    .map((body) => JSON.stringify(body))
    .sort();
}

/** `reply` の期待値を `sortedReplies` と同じ形式にする。 */
function expectedReplies(...ids: string[]) {
  return ids.map((id) => JSON.stringify(reply(id))).sort();
}

describe('POST /api/line/webhook の返信', () => {
  it('勤務予定の操作に一回返信し、空本文の 200 を返す', async () => {
    const response = await deliver([scheduleEvent('a')]);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(REPLY_ENDPOINT);
    expect(init?.method).toBe('POST');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(headers.get('content-type')).toBe('application/json');
    expect(sentReplies()).toEqual([reply('a')]);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('署名は整形を含む受信バイト列そのものに対して検証する', async () => {
    const body = `{\n  "events": [ ${JSON.stringify(scheduleEvent('a'))} ]\n}\n`;
    const response = await deliverRaw(body);

    expect(response.status).toBe(200);
    expect(sentReplies()).toEqual([reply('a')]);
  });

  it('Reply API の完了を待たずに応答する', async () => {
    let finish: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const body = JSON.stringify({ events: [scheduleEvent('a')] });
    const { response, ctx } = await post(body, await sign(body));

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    finish(Response.json({}));
    await waitOnExecutionContext(ctx);
  });

  it('複数イベントは対象だけにそれぞれ返信する', async () => {
    const response = await deliver([
      scheduleEvent('a'),
      { ...scheduleEvent('group'), source: { type: 'group', groupId: 'G', userId: 'U-private' } },
      scheduleEvent('b'),
    ]);

    expect(response.status).toBe(200);
    expect(sortedReplies()).toEqual(expectedReplies('a', 'b'));
  });

  it('同じリクエスト内でイベント ID か Reply token が重複するイベントは一回に抑える', async () => {
    await deliver([
      scheduleEvent('a'),
      scheduleEvent('a'),
      { ...scheduleEvent('a'), replyToken: 'reply-token-same-event' },
      { ...scheduleEvent('a'), webhookEventId: 'same-token' },
      scheduleEvent('b'),
    ]);

    expect(sortedReplies()).toEqual(expectedReplies('a', 'b'));
  });

  const base = scheduleEvent('x');
  it.each<[string, unknown]>([
    ['null', null],
    ['文字列', 'postback'],
    [
      'テキスト',
      { ...base, type: 'message', message: { type: 'text', text: 'action=team-schedule' } },
    ],
    ['画像', { ...base, type: 'message', message: { type: 'image', id: '1' } }],
    ['スタンプ', { ...base, type: 'message', message: { type: 'sticker', id: '1' } }],
    [
      'グループのお知らせ',
      {
        ...base,
        source: { type: 'group', groupId: 'G', userId: 'U-private' },
        postback: { data: 'action=announcements' },
      },
    ],
    [
      'グループの個人勤務予定',
      {
        ...base,
        source: { type: 'group', groupId: 'G', userId: 'U-private' },
        postback: { data: 'action=my-schedule' },
      },
    ],
    ['未知の操作', { ...base, postback: { data: 'action=unknown' } }],
    ['追加の値がある操作', { ...base, postback: { data: 'action=team-schedule&page=1' } }],
    ['空白を含む操作', { ...base, postback: { data: ' action=team-schedule' } }],
    ['空の操作', { ...base, postback: { data: '' } }],
    ['postback なし', { ...base, postback: undefined }],
    ['グループ', { ...base, source: { type: 'group', groupId: 'G', userId: 'U-private' } }],
    ['複数人トーク', { ...base, source: { type: 'room', roomId: 'R', userId: 'U-private' } }],
    ['source なし', { ...base, source: undefined }],
    ['userId なし', { ...base, source: { type: 'user' } }],
    ['空の userId', { ...base, source: { type: 'user', userId: '' } }],
    ['replyToken なし', { ...base, replyToken: undefined }],
    ['空の replyToken', { ...base, replyToken: '' }],
    ['webhookEventId なし', { ...base, webhookEventId: undefined }],
    ['空の webhookEventId', { ...base, webhookEventId: '' }],
    ['deliveryContext なし', { ...base, deliveryContext: undefined }],
    ['isRedelivery なし', { ...base, deliveryContext: {} }],
    ['再配信', { ...base, deliveryContext: { isRedelivery: true } }],
    [
      '直近の勤務予定の追加の値がある操作',
      { ...base, postback: { data: 'action=my-schedule&page=1' } },
    ],
    [
      '直近の勤務予定と同じ内容のテキスト',
      { ...base, type: 'message', message: { type: 'text', text: 'action=my-schedule' } },
    ],
    [
      'グループの直近の勤務予定',
      { ...myScheduleEvent('x'), source: { type: 'group', groupId: 'G', userId: 'U-private' } },
    ],
    [
      '複数人トークの直近の勤務予定',
      { ...myScheduleEvent('x'), source: { type: 'room', roomId: 'R', userId: 'U-private' } },
    ],
    [
      '再配信の直近の勤務予定',
      { ...myScheduleEvent('x'), deliveryContext: { isRedelivery: true } },
    ],
  ])('%s のイベントは D1 を参照せず読み飛ばす', async (_label, event) => {
    const response = await deliver([event], { accessToken: undefined });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(dbAccess).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('空のイベント一覧は 200 で返信しない', async () => {
    const response = await deliver([], { accessToken: undefined });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([undefined, ''])(
    '返信対象があるのにアクセストークンが %j の場合は 503 を返す',
    async (accessToken) => {
      const response = await deliver([scheduleEvent('a')], { accessToken });

      expect(response.status).toBe(503);
      expect(dbAccess).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

describe.each([
  ['全体の勤務予定', scheduleEvent, reply],
  [
    '直近の勤務予定',
    myScheduleEvent,
    (id: string) => ({
      replyToken: `reply-token-${id}`,
      messages: [{ type: 'text', text: UNLINKED_TEXT }],
    }),
  ],
])('%sの返信先の認可', (_name, createEvent, expectedReply) => {
  it.each<[string, Partial<typeof users.$inferInsert> | null]>([
    ['未登録', null],
    ['無効', { isActive: false }],
    ['無効な管理者', { isActive: false, role: 'ADMIN' }],
    ['未知のロール', { role: 'OWNER' }],
    ['小文字のロール', { role: 'member' }],
  ])('%sのユーザーには勤務を取得せず返信しない', async (_label, values) => {
    if (values) {
      await createDb(env.DB)
        .insert(users)
        .values({ lineUserId: 'U-target', displayName: '対象', ...values });
    }
    const prepare = vi.spyOn(env.DB, 'prepare');

    const response = await deliver([createEvent('a', 'U-target')]);

    expect(response.status).toBe(200);
    // ユーザーの照合だけで終了し、勤務は問い合わせない
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
  });

  it.each(['MEMBER', 'MANAGER', 'ADMIN'])('有効な %s には返信する', async (role) => {
    await createDb(env.DB)
      .insert(users)
      .values({ lineUserId: 'U-target', displayName: '対象', role });

    await deliver([createEvent('a', 'U-target')]);

    expect(sentReplies()).toEqual([expectedReply('a')]);
  });

  it('許可されていないイベントがあっても、別のイベントには返信する', async () => {
    await deliver([createEvent('unknown', 'U-unknown'), createEvent('a')]);

    expect(sentReplies()).toEqual([expectedReply('a')]);
  });

  it('D1 の失敗は返信せず、元の例外を含めずに記録する', async () => {
    vi.spyOn(env.DB, 'prepare').mockImplementationOnce(() => {
      throw new Error('private-d1-error U-private');
    });

    const response = await deliver([createEvent('a')]);

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorLog.mock.calls).toEqual([
      ['[line-webhook] reply failed', { kind: 'processing_error' }],
    ]);
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe('POST /api/line/webhook の認証と本文検証', () => {
  const body = JSON.stringify({ events: [scheduleEvent('a')] });

  it.each<[string, () => Promise<{ body: string; signature: string | null }>]>([
    ['署名ヘッダーなし', async () => ({ body, signature: null })],
    ['空の署名', async () => ({ body, signature: '' })],
    ['Base64 でない署名', async () => ({ body, signature: '!!!' })],
    ['長さの異なる署名', async () => ({ body, signature: btoa('short') })],
    ['別の鍵の署名', async () => ({ body, signature: await sign(body, 'wrong-secret') })],
    ['本文の改変', async () => ({ body: `${body} `, signature: await sign(body) })],
    ['署名が不正な壊れた JSON', async () => ({ body: '{', signature: await sign(body) })],
  ])('%s は 401 とし、後続の処理に進まない', async (_label, prepare) => {
    const request = await prepare();
    const parse = vi.spyOn(JSON, 'parse');
    const { response, ctx } = await post(request.body, request.signature);
    await waitOnExecutionContext(ctx);
    const parseCalls = parse.mock.calls.length;
    parse.mockRestore();

    expect(response.status).toBe(401);
    expect(parseCalls).toBe(0);
    expect(dbAccess).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([undefined, ''])('署名鍵が %j の場合は 503 を返す', async (secret) => {
    const response = await deliverRaw(body, { secret });

    expect(response.status).toBe(503);
    expect(dbAccess).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    '',
    '{',
    'null',
    '[]',
    '{}',
    '{"events":null}',
    '{"events":{}}',
    '{"events":"message"}',
  ])('署名が正しくても本文 %j は 400 を返す', async (invalid) => {
    const response = await deliverRaw(invalid);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('署名が正しくても UTF-8 でない本文は 400 を返す', async () => {
    // 文字列値の中に不正なバイトを置き、置換文字への黙った変換を許さないことを確認する
    const invalid = new Uint8Array([
      ...new TextEncoder().encode('{"events":[],"destination":"'),
      0xff,
      ...new TextEncoder().encode('"}'),
    ]);
    const response = await deliverRaw(invalid);

    expect(response.status).toBe(400);
  });
});

describe('Reply API の失敗', () => {
  it.each<[string, () => Promise<Response>, Record<string, unknown>]>([
    [
      '非成功の応答',
      async () => Response.json({ message: 'private-error-body' }, { status: 400 }),
      { kind: 'http_error', status: 400 },
    ],
    [
      'ネットワークエラー',
      async () => {
        throw new Error('private-network-error');
      },
      { kind: 'network_error' },
    ],
  ])('%s は再試行せず固定の内容だけを記録し、別のイベントを処理する', async (_label, fail, log) => {
    fetchMock.mockImplementationOnce(fail);
    const response = await deliver([scheduleEvent('a'), scheduleEvent('b')]);

    expect(response.status).toBe(200);
    expect(sortedReplies()).toEqual(expectedReplies('a', 'b'));
    expect(errorLog.mock.calls).toEqual([['[line-webhook] reply failed', log]]);
  });

  it('5 秒のタイムアウトを呼び出しごとに設定し、超過を記録する', async () => {
    const controllers = [new AbortController(), new AbortController()];
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    for (const controller of controllers) timeout.mockReturnValueOnce(controller.signal);
    // 一件目は中断されるまで応答せず、二件目は成功させる
    fetchMock.mockImplementationOnce(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('private-abort-error')));
        }),
    );
    const body = JSON.stringify({ events: [scheduleEvent('a'), scheduleEvent('b')] });
    const { response, ctx } = await post(body, await sign(body));

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(timeout.mock.calls).toEqual([[5000], [5000]]);
    expect(fetchMock.mock.calls.map(([, init]) => init?.signal)).toEqual(
      controllers.map((controller) => controller.signal),
    );
    controllers[0]?.abort();
    await waitOnExecutionContext(ctx);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(errorLog.mock.calls).toEqual([['[line-webhook] reply failed', { kind: 'timeout' }]]);
  });
});

describe('友だち追加でのリッチメニュー割り当て', () => {
  const ALIAS_URL = 'https://api.line.me/v2/bot/richmenu/alias/fuyugyo-instructor';
  const MENU_ID = 'richmenu-instructor';
  const assignUrl = (userId: string) =>
    `https://api.line.me/v2/bot/user/${userId}/richmenu/${MENU_ID}`;

  beforeEach(async () => {
    await createDb(env.DB).delete(users);
    fetchMock.mockImplementation(async (input) =>
      Response.json(String(input) === ALIAS_URL ? { richMenuId: MENU_ID } : {}),
    );
  });

  /** User を作成する。`linked` なら Instructor も作成して紐付ける。 */
  async function seedUser(lineUserId: string, { linked = true, isActive = true } = {}) {
    const db = createDb(env.DB);
    const instructorId = linked ? crypto.randomUUID() : null;
    if (instructorId) {
      await db
        .insert(instructors)
        .values({ id: instructorId, lastName: '山田', firstName: '太郎', status: 'ACTIVE' });
    }
    await db.insert(users).values({ lineUserId, displayName: '対象', isActive, instructorId });
  }

  function followEvent(userId: string, isRedelivery = false) {
    return {
      type: 'follow',
      webhookEventId: `follow-${userId}-${isRedelivery}`,
      replyToken: 'reply-token-follow',
      deliveryContext: { isRedelivery },
      source: { type: 'user', userId },
      follow: { isUnblocked: false },
    };
  }

  function sentRequests() {
    return fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${String(url)}`);
  }

  it.each([false, true])('再配信 %s でも割り当て、トークには返信しない', async (isRedelivery) => {
    await seedUser('U-linked');

    const response = await deliver([followEvent('U-linked', isRedelivery)]);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(sentRequests()).toEqual([`GET ${ALIAS_URL}`, `POST ${assignUrl('U-linked')}`]);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('同じ配送内の重複はユーザーごとに一回にし、再度の配送にも同じメニューを割り当てる', async () => {
    await seedUser('U-a');
    await seedUser('U-b');

    await deliver([followEvent('U-a'), followEvent('U-b'), followEvent('U-a', true)]);

    expect(
      sentRequests()
        .filter((request) => request.startsWith('POST'))
        .sort(),
    ).toEqual([`POST ${assignUrl('U-a')}`, `POST ${assignUrl('U-b')}`]);
    fetchMock.mockClear();

    await deliver([followEvent('U-a', true)]);

    expect(sentRequests()).toEqual([`GET ${ALIAS_URL}`, `POST ${assignUrl('U-a')}`]);
  });

  it('同じ配送の勤務予定の操作にも返信する', async () => {
    await seedUser('U-linked');

    await deliver([followEvent('U-linked'), scheduleEvent('a', 'U-linked')]);

    expect(sentRequests().sort()).toEqual([
      `GET ${ALIAS_URL}`,
      `POST ${REPLY_ENDPOINT}`,
      `POST ${assignUrl('U-linked')}`,
    ]);
  });

  it.each<[string, () => Promise<void>]>([
    ['未登録', async () => undefined],
    ['無効', () => seedUser('U-target', { isActive: false })],
    ['未連携', () => seedUser('U-target', { linked: false })],
  ])('%sのユーザーの友だち追加ではメニューを操作しない', async (_label, seed) => {
    await seed();

    const response = await deliver([followEvent('U-target')]);

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  const base = followEvent('U-linked');
  it.each<[string, unknown]>([
    ['グループ', { ...base, source: { type: 'group', groupId: 'G', userId: 'U-linked' } }],
    ['userId なし', { ...base, source: { type: 'user' } }],
    ['空の userId', { ...base, source: { type: 'user', userId: '' } }],
    ['unfollow', { ...base, type: 'unfollow' }],
  ])('%s のイベントでは D1 を参照せず割り当てない', async (_label, event) => {
    await seedUser('U-linked');

    const response = await deliver([event]);

    expect(response.status).toBe(200);
    expect(dbAccess).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('署名が不正な友だち追加では割り当てない', async () => {
    await seedUser('U-linked');
    const body = JSON.stringify({ events: [followEvent('U-linked')] });

    const { response, ctx } = await post(body, await sign(body, 'wrong-secret'));
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
    expect(dbAccess).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('LINE API の完了を待たずに応答する', async () => {
    await seedUser('U-linked');
    let finish: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const body = JSON.stringify({ events: [followEvent('U-linked')] });

    const { response, ctx } = await post(body, await sign(body));

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    finish(Response.json({ richMenuId: MENU_ID }));
    await waitOnExecutionContext(ctx);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('割り当ての失敗は 200 のまま D1 を変えず、固定の内容を通知する', async () => {
    await seedUser('U-private');
    const before = await createDb(env.DB).select().from(users);
    fetchMock.mockImplementation(async (input) =>
      String(input) === ALIAS_URL
        ? Response.json({ richMenuId: MENU_ID })
        : Response.json({ message: 'private-error-body' }, { status: 429 }),
    );

    const response = await deliver([followEvent('U-private')]);

    expect(response.status).toBe(200);
    expect(captureException.mock.calls).toEqual([
      [
        new Error('External API failed: line.richmenu.user.link (429)'),
        { tags: { endpoint: 'line.richmenu.user.link', httpStatus: 429 } },
      ],
    ]);
    expect(await createDb(env.DB).select().from(users)).toEqual(before);
  });

  it('D1 を確認できない場合は割り当てず、元の例外を含めずに通知する', async () => {
    await seedUser('U-private');
    vi.spyOn(env.DB, 'prepare').mockImplementationOnce(() => {
      throw new Error('private-d1-error U-private');
    });

    const response = await deliver([followEvent('U-private')]);

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(captureException.mock.calls).toEqual([
      [
        new Error('Operation failed: line.richmenu.user.check (db_error)'),
        { tags: { endpoint: 'line.richmenu.user.check', failureKind: 'db_error' } },
      ],
    ]);
    const [error] = captureException.mock.calls[0] ?? [];
    expect(error).not.toHaveProperty('cause');
    const [user] = await createDb(env.DB)
      .select()
      .from(users)
      .where(eq(users.lineUserId, 'U-private'));
    expect(user?.instructorId).not.toBeNull();
  });
});

/** 担当者を割り当てた勤務枠を作成し、ID を返す。 */
async function seedShift(
  date: string,
  departmentCode: string,
  shiftTypeId: string,
  instructorIds: string[],
  status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED',
) {
  const db = createDb(env.DB);
  const id = crypto.randomUUID();
  await db.insert(shifts).values({
    id,
    date: new Date(`${date}T00:00:00.000Z`),
    departmentCode,
    shiftTypeId,
    status,
    description: 'private-description',
  });
  for (const instructorId of instructorIds) {
    await db.insert(shiftAssignments).values({ shiftId: id, instructorId });
  }
  return id;
}

const replySchema = z.object({
  messages: z.tuple([
    z.object({
      type: z.literal('flex'),
      altText: z.string(),
      contents: z.object({ type: z.literal('carousel'), contents: z.array(z.unknown()) }),
    }),
  ]),
});
const textSchema = z.object({
  type: z.literal('text'),
  text: z.string().optional(),
  contents: z.array(z.object({ text: z.string(), weight: z.string().optional() })).optional(),
});
const boxSchema = z.object({ type: z.literal('box'), contents: z.array(z.unknown()) });
const bubbleSchema = z.object({
  header: z.object({ contents: z.tuple([textSchema, textSchema]) }),
  body: boxSchema,
});

/** 勤務枠を「部門 / 種別 / 担当者」に要約する。太字の部分は `*` で囲む。 */
function summarizeSlot(component: unknown): string {
  const [title, members] = boxSchema.parse(component).contents;
  const [department, shiftType] = boxSchema.parse(title).contents;
  const label = textSchema.parse(boxSchema.parse(department).contents[0]).text;
  const { text, contents } = textSchema.parse(members);
  const names =
    text ??
    contents?.map((span) => (span.weight === 'bold' ? `*${span.text}*` : span.text)).join('');
  return `${label} / ${textSchema.parse(shiftType).text} / ${names}`;
}

/** 返信されたカードを、日付と本文の要約にする。 */
async function deliverSchedule(userId: string, createEvent = scheduleEvent) {
  await deliver([createEvent('a', userId)]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [message] = replySchema.parse(sentReplies()[0]).messages;
  const days = message.contents.contents.map((bubble) => {
    const { header, body } = bubbleSchema.parse(bubble);
    const lines = body.contents.flatMap((component) => {
      const text = textSchema.safeParse(component);
      if (text.success) return [text.data.text];
      return boxSchema.safeParse(component).success ? [summarizeSlot(component)] : [];
    });
    return [header.contents[1].text, ...lines];
  });
  const labels = message.contents.contents.map(
    (bubble) => bubbleSchema.parse(bubble).header.contents[0].text,
  );
  return { altText: message.altText, labels, days };
}

const EMPTY_DAY = 'この日の勤務予定はありません。';

describe('全体の勤務予定の内容', () => {
  /** 本人を含むインストラクター、勤務種別、期間内外の勤務を作成する。 */
  async function seedSchedule() {
    const db = createDb(env.DB);
    await db.insert(instructors).values([
      {
        id: 'i-self',
        lastName: '本人',
        firstName: '花子',
        lastNameKana: 'ん',
        firstNameKana: 'ん',
      },
      {
        id: 'i-a',
        lastName: '青木',
        firstName: '一',
        lastNameKana: 'あおき',
        firstNameKana: 'はじめ',
      },
      {
        id: 'i-w',
        lastName: '渡辺',
        firstName: '二',
        lastNameKana: 'わたなべ',
        firstNameKana: 'じ',
      },
    ]);
    // 資格順はかな順より優先する
    await db.insert(certifications).values({
      id: 'cert',
      departmentCode: 'ski',
      name: '指導員',
      shortName: '指',
      organization: '連盟',
    });
    await db
      .insert(instructorCertifications)
      .values({ instructorId: 'i-w', certificationId: 'cert' });
    await db.insert(shiftTypes).values([
      { id: 't-general', name: '一般レッスン' },
      { id: 't-group', name: '団体レッスン' },
      { id: 't-unlisted-b', name: '同名の種別' },
      { id: 't-unlisted-a', name: '同名の種別' },
    ]);
    await db.insert(departmentShiftTypes).values([
      { id: 'f-ski-general', departmentCode: 'ski', shiftTypeId: 't-general', sortOrder: 2 },
      { departmentCode: 'ski', shiftTypeId: 't-group', sortOrder: 1 },
      { departmentCode: 'snowboard', shiftTypeId: 't-general', sortOrder: 1 },
    ]);
    await db
      .insert(certificationRequirements)
      .values({ departmentShiftTypeId: 'f-ski-general', certificationId: 'cert', tierRank: 1 });

    // 期間の前後
    await seedShift('2026-11-26', 'ski', 't-general', ['i-a']);
    await seedShift('2026-12-05', 'ski', 't-general', ['i-a']);
    // 期間の初日（登録順は表示順と逆にする）
    await seedShift('2026-11-28', 'snowboard', 't-general', ['i-a']);
    await seedShift('2026-11-28', 'ski', 't-unlisted-b', ['i-a']);
    await seedShift('2026-11-28', 'ski', 't-unlisted-a', ['i-w']);
    await seedShift('2026-11-28', 'ski', 't-general', ['i-self', 'i-a', 'i-w']);
    await seedShift('2026-11-28', 'ski', 't-group', ['i-a']);
    // 公開していない枠と担当者のいない枠
    await seedShift('2026-11-29', 'ski', 't-general', ['i-self'], 'DRAFT');
    await seedShift('2026-11-29', 'ski', 't-group', []);
    // 月またぎと期間の末日
    await seedShift('2026-12-01', 'ski', 't-group', ['i-a']);
    await seedShift('2026-12-04', 'snowboard', 't-general', ['i-self']);
    await seedShift('2026-11-27', 'ski', 't-group', ['i-w']);
  }

  it('日本時間の当日から7日間の公開済み勤務を日付と表示順に返し、本人だけを太字にする', async () => {
    await seedSchedule();
    await createDb(env.DB)
      .insert(users)
      .values({ lineUserId: 'U-self', displayName: '本人', instructorId: 'i-self' });

    const { altText, days } = await deliverSchedule('U-self');

    expect(altText).toBe('全体の勤務予定（11/28（土）〜12/4（金））勤務予定のある日：3日');
    expect(days).toEqual([
      [
        '11/28（土）',
        'スキー / 団体レッスン / 青木 一',
        'スキー / 一般レッスン / 渡辺 二、青木 一、*本人 花子*',
        'スキー / 同名の種別 / 渡辺 二',
        'スキー / 同名の種別 / 青木 一',
        'スノーボード / 一般レッスン / 青木 一',
      ],
      ['11/29（日）', EMPTY_DAY],
      ['11/30（月）', EMPTY_DAY],
      ['12/1（火）', 'スキー / 団体レッスン / 青木 一'],
      ['12/2（水）', EMPTY_DAY],
      ['12/3（木）', EMPTY_DAY],
      ['12/4（金）', 'スノーボード / 一般レッスン / *本人 花子*'],
    ]);
    const sent = JSON.stringify(sentReplies());
    expect(sent).not.toContain('private-description');
    expect(sent).not.toContain('http');
  });

  it('日本時間の日付が変わる直前は、前日からの7日間を返す', async () => {
    await seedSchedule();
    vi.setSystemTime(new Date(NOW.getTime() - 1));

    const { days } = await deliverSchedule('U-private');

    expect(days.map(([date]) => date)).toEqual([
      '11/27（金）',
      '11/28（土）',
      '11/29（日）',
      '11/30（月）',
      '12/1（火）',
      '12/2（水）',
      '12/3（木）',
    ]);
    expect(days[0]).toEqual(['11/27（金）', 'スキー / 団体レッスン / 渡辺 二']);
  });

  it.each(['MEMBER', 'MANAGER', 'ADMIN'])(
    '%s にも公開済みで担当者のいる枠だけを返し、未紐付けなら強調しない',
    async (role) => {
      await seedSchedule();
      await createDb(env.DB)
        .insert(users)
        .values({ lineUserId: 'U-target', displayName: '対象', role });

      const { days } = await deliverSchedule('U-target');

      expect(days[1]).toEqual(['11/29（日）', EMPTY_DAY]);
      expect(days[6]).toEqual(['12/4（金）', 'スノーボード / 一般レッスン / 本人 花子']);
      expect(JSON.stringify(sentReplies())).not.toContain('"span"');
    },
  );

  it('期間内が下書きと担当者のいない枠だけの場合はテキストを返す', async () => {
    await seedSchedule();
    await createDb(env.DB).update(shifts).set({ status: 'DRAFT' });

    await deliver([scheduleEvent('a')]);

    expect(sentReplies()).toEqual([reply('a')]);
  });
});

describe('直近の勤務予定の内容', () => {
  beforeEach(async () => {
    const db = createDb(env.DB);
    await db.insert(instructors).values([
      {
        id: 'i-self',
        lastName: '本人',
        firstName: '花子',
        lastNameKana: 'ん',
        firstNameKana: 'ん',
      },
      {
        id: 'i-a',
        lastName: '青木',
        firstName: '一',
        lastNameKana: 'あおき',
        firstNameKana: 'はじめ',
      },
    ]);
    await db.insert(shiftTypes).values([
      { id: 't-general', name: '一般レッスン' },
      { id: 't-group', name: '団体レッスン' },
    ]);
    await db.insert(departmentShiftTypes).values([
      { departmentCode: 'ski', shiftTypeId: 't-group', sortOrder: 1 },
      { departmentCode: 'ski', shiftTypeId: 't-general', sortOrder: 2 },
      { departmentCode: 'snowboard', shiftTypeId: 't-group', sortOrder: 1 },
      { departmentCode: 'snowboard', shiftTypeId: 't-general', sortOrder: 2 },
    ]);
    await db
      .insert(users)
      .values({ lineUserId: 'U-self', displayName: '本人', instructorId: 'i-self' });
  });

  /** 直近の勤務予定を操作し、返信されたカードの要約を返す。 */
  function deliverMySchedule() {
    return deliverSchedule('U-self', myScheduleEvent);
  }

  /** 直近の勤務予定を操作し、指定したテキストが一回返信されることを確認する。 */
  async function expectTextReply(text: string, userId = 'U-self') {
    await deliver([myScheduleEvent('a', userId)]);

    expect(sentReplies()).toEqual([
      { replyToken: 'reply-token-a', messages: [{ type: 'text', text }] },
    ]);
  }

  it('本人の直近3枠の日だけを昇順のカードにし、その日の公開済み勤務を返す', async () => {
    // 登録順は表示順と逆にする
    await seedShift('2026-12-10', 'ski', 't-general', ['i-self']);
    await seedShift('2026-12-03', 'snowboard', 't-general', ['i-self', 'i-a']);
    await seedShift('2026-11-28', 'snowboard', 't-general', ['i-a']);
    await seedShift('2026-11-28', 'ski', 't-general', ['i-self']);
    await seedShift('2026-11-28', 'ski', 't-group', ['i-self', 'i-a']);
    // 選ばれた日の下書きと担当者のいない枠
    await seedShift('2026-11-28', 'snowboard', 't-group', ['i-self'], 'DRAFT');
    await seedShift('2026-12-03', 'ski', 't-group', []);
    // 過去、下書きだけの日、別人だけが勤務する日
    await seedShift('2026-11-27', 'ski', 't-general', ['i-self']);
    await seedShift('2026-11-29', 'ski', 't-general', ['i-self'], 'DRAFT');
    await seedShift('2026-11-30', 'ski', 't-general', ['i-a']);

    const { altText, labels, days } = await deliverMySchedule();

    expect(altText).toBe('直近の勤務予定（11/28（土）〜12/3（木））勤務予定のある日：2日');
    expect(labels).toEqual(['直近の勤務予定', '直近の勤務予定']);
    expect(days).toEqual([
      [
        '11/28（土）',
        'スキー / 団体レッスン / 青木 一、*本人 花子*',
        'スキー / 一般レッスン / *本人 花子*',
        'スノーボード / 一般レッスン / 青木 一',
      ],
      ['12/3（木）', 'スノーボード / 一般レッスン / 青木 一、*本人 花子*'],
    ]);
    const sent = JSON.stringify(sentReplies());
    expect(sent).not.toContain('private-description');
    expect(sent).not.toContain('http');
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('同じ日の3枠は1枚にし、別の日の4枠目は選ばない', async () => {
    await seedShift('2026-11-28', 'ski', 't-group', ['i-self']);
    await seedShift('2026-11-28', 'ski', 't-general', ['i-self']);
    await seedShift('2026-11-28', 'snowboard', 't-group', ['i-self']);
    await seedShift('2026-11-29', 'ski', 't-group', ['i-self']);

    const { altText, days } = await deliverMySchedule();

    expect(altText).toBe('直近の勤務予定（11/28（土）〜11/28（土））勤務予定のある日：1日');
    expect(days.map(([date]) => date)).toEqual(['11/28（土）']);
  });

  it('選ばれた日の勤務は、3枠の制限を超えてもすべて表示する', async () => {
    await seedShift('2026-11-28', 'ski', 't-group', ['i-self']);
    await seedShift('2026-11-28', 'ski', 't-general', ['i-self']);
    await seedShift('2026-11-29', 'ski', 't-group', ['i-self']);
    await seedShift('2026-11-29', 'ski', 't-general', ['i-self']);

    const { days } = await deliverMySchedule();

    expect(days).toEqual([
      ['11/28（土）', 'スキー / 団体レッスン / *本人 花子*', 'スキー / 一般レッスン / *本人 花子*'],
      ['11/29（日）', 'スキー / 団体レッスン / *本人 花子*', 'スキー / 一般レッスン / *本人 花子*'],
    ]);
  });

  it.each<[string, string[], string[]]>([
    ['1枠', ['2026-12-01'], ['12/1（火）']],
    ['2枠', ['2026-12-01', '2028-03-01'], ['12/1（火）', '3/1（水）']],
  ])('勤務が%sだけなら、未来の期限なく該当する日だけを返す', async (_label, dates, expected) => {
    for (const date of dates) await seedShift(date, 'ski', 't-general', ['i-self']);

    const { days } = await deliverMySchedule();

    expect(days.map(([date]) => date)).toEqual(expected);
  });

  it.each([
    ['直前', new Date(NOW.getTime() - 1), ['11/27（金）', '11/28（土）', '11/29（日）']],
    ['直後', NOW, ['11/28（土）', '11/29（日）', '11/30（月）']],
  ])('日本時間の日付が変わる%sは、その時点の当日以降を選ぶ', async (_label, now, expected) => {
    vi.setSystemTime(now);
    for (const date of ['2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30']) {
      await seedShift(date, 'ski', 't-general', ['i-self']);
    }

    const { days } = await deliverMySchedule();

    expect(days.map(([date]) => date)).toEqual(expected);
  });

  it.each<[string, () => Promise<unknown>]>([
    ['勤務がない', async () => undefined],
    ['過去の勤務だけ', () => seedShift('2026-11-27', 'ski', 't-general', ['i-self'])],
    ['下書きだけ', () => seedShift('2026-11-28', 'ski', 't-general', ['i-self'], 'DRAFT')],
    [
      '別人の勤務と空枠だけ',
      async () => {
        await seedShift('2026-11-28', 'ski', 't-general', ['i-a']);
        await seedShift('2026-11-29', 'ski', 't-general', []);
      },
    ],
  ])('%sの場合は、今後の勤務予定がないことをテキストで返す', async (_label, seed) => {
    await seed();

    await expectTextReply(NO_UPCOMING_TEXT);
  });

  it.each(['MEMBER', 'MANAGER', 'ADMIN'])(
    '未紐付けの %s には勤務を照会せず、紐付けがないことを返す',
    async (role) => {
      await seedShift('2026-11-28', 'ski', 't-general', ['i-self']);
      await createDb(env.DB)
        .insert(users)
        .values({ lineUserId: 'U-target', displayName: '対象', role });
      const prepare = vi.spyOn(env.DB, 'prepare');

      await expectTextReply(UNLINKED_TEXT, 'U-target');

      // ユーザーの照合だけで終了し、勤務は問い合わせない
      expect(prepare).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['MANAGER', 'ADMIN'])('%s にも下書きを表示しない', async (role) => {
    await createDb(env.DB).update(users).set({ role }).where(eq(users.lineUserId, 'U-self'));
    await seedShift('2026-11-28', 'ski', 't-general', ['i-self'], 'DRAFT');
    await seedShift('2026-11-29', 'ski', 't-general', ['i-self']);
    await seedShift('2026-11-29', 'ski', 't-group', ['i-a'], 'DRAFT');

    const { days } = await deliverMySchedule();

    expect(days).toEqual([['11/29（日）', 'スキー / 一般レッスン / *本人 花子*']]);
  });

  /** 候補日の勤務を取得する直前に、指定した勤務枠を下書きに戻す。 */
  function unpublishBeforeScheduleLoad(shiftIds: string[]) {
    const prepare = env.DB.prepare.bind(env.DB);
    vi.spyOn(env.DB, 'prepare').mockImplementation((query) => {
      // 備考を含む列を読むのは、日付を指定した勤務の取得だけ
      if (query.startsWith('select') && query.includes('"description"')) {
        for (const id of shiftIds.splice(0)) {
          void prepare("update shifts set status = 'DRAFT' where id = ?").bind(id).run();
        }
      }
      return prepare(query);
    });
  }

  it('取得までに本人の公開済み勤務がなくなった候補日は除く', async () => {
    const hidden = await seedShift('2026-11-28', 'ski', 't-general', ['i-self']);
    await seedShift('2026-11-28', 'ski', 't-group', ['i-a']);
    await seedShift('2026-11-29', 'ski', 't-general', ['i-self']);
    unpublishBeforeScheduleLoad([hidden]);

    const { altText, days } = await deliverMySchedule();

    expect(altText).toBe('直近の勤務予定（11/29（日）〜11/29（日））勤務予定のある日：1日');
    expect(days).toEqual([['11/29（日）', 'スキー / 一般レッスン / *本人 花子*']]);
  });

  it('取得までにすべての候補日がなくなった場合はテキストを返す', async () => {
    const hidden = await seedShift('2026-11-28', 'ski', 't-general', ['i-self']);
    await seedShift('2026-11-28', 'ski', 't-group', ['i-a']);
    unpublishBeforeScheduleLoad([hidden]);

    await expectTextReply(NO_UPCOMING_TEXT);
  });

  it('同じ配送の全体の勤務予定と直近の勤務予定に、それぞれ返信する', async () => {
    await seedShift('2026-11-28', 'ski', 't-general', ['i-self']);

    await deliver([scheduleEvent('team', 'U-self'), myScheduleEvent('mine', 'U-self')]);

    const sent = sortedReplies();
    expect(sent).toHaveLength(2);
    expect(sent[0]).toContain('reply-token-mine');
    expect(sent[0]).toContain('直近の勤務予定');
    expect(sent[1]).toContain('reply-token-team');
    expect(sent[1]).toContain('全体の勤務予定');
  });
});

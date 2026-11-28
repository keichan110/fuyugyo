import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../src/index';
import { createDb } from '../src/server/db/client';
import { instructors, users } from '../src/server/db/schema';

const SECRET = 'test-messaging-channel-secret';
const ACCESS_TOKEN = 'test-messaging-access-token';
const REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply';

/** 受信側の設定（未指定の項目はテストの既定値、undefined は未設定を表す） */
type Settings = {
  secret?: string | undefined;
  accessToken?: string | undefined;
  echoEnabled?: string | undefined;
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

beforeEach(() => {
  fetchMock.mockImplementation(async () => Response.json({}));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(errorLog);
});

afterEach(() => {
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
  const { secret, accessToken, echoEnabled } = {
    secret: SECRET,
    accessToken: ACCESS_TOKEN,
    echoEnabled: 'true',
    ...settings,
  };
  const requestEnv = {
    ...env,
    LINE_MESSAGING_CHANNEL_SECRET: secret,
    LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: accessToken,
    LINE_MESSAGING_ECHO_ENABLED: echoEnabled,
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

/** 返信対象となるテキストイベントを作る。 */
function textEvent(id: string, text = `本文-${id}`) {
  return {
    type: 'message',
    webhookEventId: id,
    replyToken: `reply-token-${id}`,
    deliveryContext: { isRedelivery: false },
    source: { type: 'user', userId: 'U-private' },
    message: { type: 'text', id: `message-${id}`, text },
  };
}

/** Reply API に送った JSON 本文の一覧を返す。 */
function sentReplies(): unknown[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
}

/** イベント ID に対応する、期待する返信本文を作る。 */
function reply(id: string, text = `本文-${id}`) {
  return { replyToken: `reply-token-${id}`, messages: [{ type: 'text', text }] };
}

describe('POST /api/line/webhook の返信', () => {
  it('個人トークのテキストを元の文字列のまま一回返信し、空本文の 200 を返す', async () => {
    const text = '  こんにちは\n"LINE" 😀 \\ $  ';
    const response = await deliver([textEvent('a', text)]);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(REPLY_ENDPOINT);
    expect(init?.method).toBe('POST');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(headers.get('content-type')).toBe('application/json');
    expect(sentReplies()).toEqual([reply('a', text)]);
    expect(dbAccess).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('署名は整形を含む受信バイト列そのものに対して検証する', async () => {
    const body = `{\n  "events": [ ${JSON.stringify(textEvent('a'))} ]\n}\n`;
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
    const body = JSON.stringify({ events: [textEvent('a')] });
    const { response, ctx } = await post(body, await sign(body));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(Response.json({}));
    await waitOnExecutionContext(ctx);
  });

  it('複数イベントは対象だけに返信し、同じリクエスト内の重複は一回に抑える', async () => {
    const response = await deliver([
      textEvent('a'),
      { ...textEvent('group'), source: { type: 'group', groupId: 'G' } },
      textEvent('a'),
      textEvent('b'),
    ]);

    expect(response.status).toBe(200);
    expect(sentReplies()).toEqual([reply('a'), reply('b')]);
  });

  const base = textEvent('x');
  it.each<[string, unknown]>([
    ['null', null],
    ['文字列', 'message'],
    ['message 以外', { ...base, type: 'follow' }],
    ['グループ', { ...base, source: { type: 'group', groupId: 'G', userId: 'U' } }],
    ['複数人トーク', { ...base, source: { type: 'room', roomId: 'R', userId: 'U' } }],
    ['source なし', { ...base, source: undefined }],
    ['テキスト以外', { ...base, message: { type: 'sticker', id: '1' } }],
    ['空の本文', { ...base, message: { type: 'text', text: '' } }],
    ['本文なし', { ...base, message: { type: 'text' } }],
    ['message なし', { ...base, message: undefined }],
    ['replyToken なし', { ...base, replyToken: undefined }],
    ['空の replyToken', { ...base, replyToken: '' }],
    ['webhookEventId なし', { ...base, webhookEventId: undefined }],
    ['空の webhookEventId', { ...base, webhookEventId: '' }],
    ['deliveryContext なし', { ...base, deliveryContext: undefined }],
    ['isRedelivery なし', { ...base, deliveryContext: {} }],
    ['再配信', { ...base, deliveryContext: { isRedelivery: true } }],
  ])('%s のイベントは読み飛ばす', async (_label, event) => {
    const response = await deliver([event], { accessToken: undefined });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('空のイベント一覧は 200 で返信しない', async () => {
    const response = await deliver([], { accessToken: undefined });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'false', 'TRUE', '1'])(
    'フラグが %j の場合は返信せず 200 を返す',
    async (echoEnabled) => {
      const response = await deliver([textEvent('a')], { echoEnabled, accessToken: undefined });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, ''])(
    '返信対象があるのにアクセストークンが %j の場合は 503 を返す',
    async (accessToken) => {
      const response = await deliver([textEvent('a')], { accessToken });

      expect(response.status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

describe('POST /api/line/webhook の認証と本文検証', () => {
  const body = JSON.stringify({ events: [textEvent('a')] });

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
    const response = await deliver([textEvent('a'), textEvent('b')]);

    expect(response.status).toBe(200);
    expect(sentReplies()).toEqual([reply('a'), reply('b')]);
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
    const body = JSON.stringify({ events: [textEvent('a'), textEvent('b')] });
    const { response, ctx } = await post(body, await sign(body));

    expect(response.status).toBe(200);
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
    const db = createDb(env.DB);
    await db.delete(users);
    await db.delete(instructors);
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

  it.each([
    [undefined, false],
    ['false', true],
    ['true', false],
  ])(
    'エコー設定 %j・再配信 %s でも割り当て、トークには返信しない',
    async (echoEnabled, isRedelivery) => {
      await seedUser('U-linked');

      const response = await deliver([followEvent('U-linked', isRedelivery)], { echoEnabled });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('');
      expect(sentRequests()).toEqual([`GET ${ALIAS_URL}`, `POST ${assignUrl('U-linked')}`]);
      expect(captureException).not.toHaveBeenCalled();
    },
  );

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

  it('同じ配送のテキストは従来どおり返信する', async () => {
    await seedUser('U-linked');

    await deliver([followEvent('U-linked'), textEvent('a')]);

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

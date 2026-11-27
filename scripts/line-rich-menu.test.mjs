import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildDefinitions, IMAGE_FILES, PURPOSES } from './line-rich-menu/definitions.ts';
import { createLineApi } from './line-rich-menu/line-api.ts';
import {
  parseKnownRequests,
  publishRichMenus,
  resumeRequestKey,
} from './line-rich-menu/publish.ts';

const ALIAS = 'fuyugyo-instructor';
const LIFF_URL = 'https://liff.line.me/0000000000-test';
const images = {
  default: new Uint8Array(Buffer.from('default-v1')),
  instructor: new Uint8Array(Buffer.from('instructor-v1')),
};
const nextInstructor = { ...images, instructor: new Uint8Array(Buffer.from('instructor-v2')) };

/** LINE のリッチメニュー API を、状態と失敗の注入を持つ `fetch` として模す。 */
function createFakeLine() {
  const state = {
    menus: new Map(),
    defaultId: null,
    aliases: new Map(),
    /** ユーザー ID から個別に割り当てたメニュー ID */
    links: new Map(),
    batches: new Map(),
    /** 次に受け付ける一括置換の結果（succeeded / failed / ongoing） */
    batchOutcomes: [],
    calls: [],
    faults: [],
    sequence: 0,
  };

  const reply = (status, body = {}, headers = {}) =>
    new Response(body instanceof Uint8Array ? body : JSON.stringify(body), { status, headers });

  /** 実際の LINE と同じく、完了した置換だけを割り当てに反映する。 */
  const complete = (batch) => {
    batch.phase = 'succeeded';
    for (const [user, id] of state.links) if (id === batch.from) state.links.set(user, batch.to);
  };

  function handle(method, url, body) {
    const path = url.pathname.replace('/v2/bot/', '');
    let match;
    if (path === 'info') return reply(200, { basicId: '@test' });
    if (path === 'richmenu/list') {
      const richmenus = [...state.menus].map(([richMenuId, menu]) => ({
        richMenuId,
        ...menu.definition,
      }));
      return reply(200, { richmenus });
    }
    if (path === 'richmenu' && method === 'POST') {
      state.sequence += 1;
      const richMenuId = `richmenu-${state.sequence}`;
      state.menus.set(richMenuId, { definition: JSON.parse(body), image: null });
      return reply(200, { richMenuId });
    }
    if ((match = /^richmenu\/([^/]+)\/content$/.exec(path))) {
      assert.equal(url.host, 'api-data.line.me');
      const menu = state.menus.get(match[1]);
      if (method === 'GET') {
        return menu?.image ? reply(200, menu.image) : reply(404, { message: 'Not found' });
      }
      if (!menu) return reply(404);
      if (menu.image) return reply(400, { message: 'already uploaded' });
      menu.image = new Uint8Array(body);
      return reply(200);
    }
    if (path === 'user/all/richmenu') {
      return state.defaultId ? reply(200, { richMenuId: state.defaultId }) : reply(404);
    }
    if ((match = /^user\/all\/richmenu\/([^/]+)$/.exec(path))) {
      state.defaultId = match[1];
      return reply(200);
    }
    if (path === 'richmenu/alias/list') {
      const aliases = [...state.aliases].map(([richMenuAliasId, richMenuId]) => ({
        richMenuAliasId,
        richMenuId,
      }));
      return reply(200, { aliases });
    }
    if (path === 'richmenu/alias') {
      const { richMenuAliasId, richMenuId } = JSON.parse(body);
      if (state.aliases.has(richMenuAliasId)) return reply(400, { message: 'conflict' });
      state.aliases.set(richMenuAliasId, richMenuId);
      return reply(200);
    }
    if ((match = /^richmenu\/alias\/([^/]+)$/.exec(path))) {
      const target = state.aliases.get(match[1]);
      if (!target) return reply(404);
      if (method === 'GET') return reply(200, { richMenuAliasId: match[1], richMenuId: target });
      state.aliases.set(match[1], JSON.parse(body).richMenuId);
      return reply(200);
    }
    if (path === 'richmenu/batch') {
      const { operations, resumeRequestKey: key } = JSON.parse(body);
      const [{ from, to }] = operations;
      state.sequence += 1;
      const requestId = `request-${state.sequence}`;
      const batch = { from, to, key, phase: state.batchOutcomes.shift() ?? 'succeeded' };
      state.batches.set(requestId, batch);
      if (batch.phase === 'succeeded') complete(batch);
      return reply(202, {}, { 'x-line-request-id': requestId });
    }
    if (path === 'richmenu/progress/batch') {
      const batch = state.batches.get(url.searchParams.get('requestId'));
      return batch ? reply(200, { phase: batch.phase }) : reply(404);
    }
    if ((match = /^richmenu\/([^/]+)$/.exec(path)) && method === 'DELETE') {
      if (!state.menus.delete(match[1])) return reply(404);
      for (const [user, id] of state.links) if (id === match[1]) state.links.delete(user);
      return reply(200);
    }
    throw new Error(`未対応の要求: ${method} ${path}`);
  }

  async function fetch(input, init) {
    const url = new URL(input);
    const label = `${init.method} ${url.pathname.replace('/v2/bot/', '')}`;
    state.calls.push(label);
    const index = state.faults.findIndex((fault) => fault.pattern.test(label));
    if (index < 0) return handle(init.method, url, init.body);
    const fault = state.faults[index];
    state.faults.splice(index, 1);
    // applied: LINE 側には反映されたが、応答が届かない
    if (fault.applied) handle(init.method, url, init.body);
    if (fault.status) return reply(fault.status, { message: 'injected' });
    throw new TypeError('network error');
  }

  const logs = [];
  const publish = (overrides = {}) =>
    publishRichMenus({
      api: createLineApi({ accessToken: 'test-token', fetch }),
      officialAccountId: '@test',
      liffUrl: LIFF_URL,
      images,
      assignmentStopped: true,
      knownRequests: [],
      sleep: async () => {},
      log: (message) => logs.push(message),
      ...overrides,
    });

  /** 更新系の呼び出しだけを取り出す。 */
  const writes = () => state.calls.filter((call) => !call.startsWith('GET '));
  const fail = (pattern, options = {}) => state.faults.push({ pattern, ...options });

  return { state, publish, writes, fail, logs };
}

/** 初版を公開し、連携済み用を割り当てたユーザーと管理対象外のメニューを用意する。 */
async function publishedLine() {
  const line = createFakeLine();
  line.state.menus.set('richmenu-manual', {
    definition: { name: 'fuyugyo-richmenu:instructor:manual' },
    image: new Uint8Array([1]),
  });
  const first = await line.publish();
  line.state.links.set('user-1', first.menuIds.instructor);
  line.state.calls.length = 0;
  return { ...line, first };
}

const batchCalls = (line) => line.state.calls.filter((call) => call === 'POST richmenu/batch');

test('定義は承認された領域と操作値を持つ', () => {
  const definitions = buildDefinitions(LIFF_URL);
  const rows = (purpose) =>
    definitions[purpose].areas.map(({ bounds, action }) => [
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      action,
    ]);
  const open = { type: 'uri', uri: LIFF_URL };
  const postback = (data) => ({ type: 'postback', data });

  assert.deepEqual(rows('default'), [[0, 0, 2500, 843, open]]);
  assert.deepEqual(rows('instructor'), [
    [0, 0, 2500, 924, open],
    [0, 924, 835, 762, postback('action=team-schedule')],
    [835, 924, 830, 762, postback('action=my-schedule')],
    [1665, 924, 835, 762, postback('action=announcements')],
  ]);
});

test('収録画像は定義と同じ寸法の 1 MB 以下の JPEG である', () => {
  const definitions = buildDefinitions(LIFF_URL);
  for (const purpose of PURPOSES) {
    const data = readFileSync(
      new URL(`./line-rich-menu/assets/${IMAGE_FILES[purpose]}`, import.meta.url),
    );
    assert.ok(data.length <= 1024 * 1024, `${purpose} の画像が 1 MB を超えています`);
    assert.equal(data.readUInt16BE(0), 0xffd8);
    // 寸法はフレームヘッダー（SOF）にあるため、セグメントを順にたどる
    let offset = 2;
    while (![0xc0, 0xc1, 0xc2].includes(data[offset + 1])) {
      offset += 2 + data.readUInt16BE(offset + 2);
    }
    assert.deepEqual(
      { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5) },
      definitions[purpose].size,
    );
  }
});

test('初回はデフォルトとエイリアスを設定し、一括置換と削除をしない', async () => {
  const line = createFakeLine();
  const result = await line.publish({ assignmentStopped: false });

  assert.equal(line.state.menus.size, 2);
  assert.equal(line.state.defaultId, result.menuIds.default);
  assert.equal(line.state.aliases.get(ALIAS), result.menuIds.instructor);
  assert.deepEqual(result.deletedIds, []);
  assert.equal(batchCalls(line).length, 0);
});

test('同じ入力の再実行は LINE 側を変更しない', async () => {
  const line = await publishedLine();
  const result = await line.publish({ assignmentStopped: false });

  assert.deepEqual(result.menuIds, line.first.menuIds);
  assert.deepEqual(line.writes(), []);
});

test('画像の変更は割り当てを新版へ移して旧版を削除し、管理対象外を残す', async () => {
  const line = await publishedLine();
  const result = await line.publish({ images: nextInstructor });
  const old = line.first.menuIds.instructor;

  assert.equal(result.menuIds.default, line.first.menuIds.default);
  assert.equal(line.state.aliases.get(ALIAS), result.menuIds.instructor);
  assert.equal(line.state.links.get('user-1'), result.menuIds.instructor);
  assert.deepEqual(result.deletedIds, [old]);
  assert.ok(line.state.menus.has('richmenu-manual'));
  assert.equal(line.state.menus.size, 3);
  const [batch] = line.state.batches.values();
  assert.equal(batch.key, resumeRequestKey(old, result.menuIds.instructor));
  assert.match(batch.key, /^[0-9a-zA-Z_-]{1,100}$/);
});

test('LIFF URL の変更は両方を新版にし、組ごとの再開キーで連携済み用から移す', async () => {
  const line = await publishedLine();
  const result = await line.publish({ liffUrl: `${LIFF_URL}-next` });
  const batches = [...line.state.batches.values()];

  assert.deepEqual(
    batches.map((batch) => batch.from),
    [line.first.menuIds.instructor, line.first.menuIds.default],
  );
  assert.notEqual(batches[0].key, batches[1].key);
  assert.equal(line.state.defaultId, result.menuIds.default);
  assert.equal(result.deletedIds.length, 2);
});

test('作成の応答が失われても一覧で照合し、二重に作成しない', async () => {
  const line = createFakeLine();
  line.fail(/^POST richmenu$/, { applied: true });
  await line.publish();

  assert.equal(line.state.menus.size, 2);
});

test('作成の成否を確認できなければ停止し、再実行で復旧する', async () => {
  const line = createFakeLine();
  line.fail(/^POST richmenu$/, { status: 500 });

  await assert.rejects(line.publish(), /作成の成否を確認できません/);
  assert.equal(line.state.defaultId, null);
  assert.equal(line.writes().filter((call) => call === 'POST richmenu').length, 1);

  await line.publish();
  assert.equal(line.state.menus.size, 2);
});

test('画像登録の中断は切り替え前に停止し、同じメニューへの登録から再開する', async () => {
  const line = createFakeLine();
  line.fail(/^POST richmenu\/richmenu-2\/content$/);

  await assert.rejects(line.publish(), /応答なし/);
  assert.equal(line.state.defaultId, null);
  assert.equal(line.state.aliases.size, 0);

  await line.publish();
  assert.equal(line.state.menus.size, 2);
});

test('画像登録の応答が失われても取得して照合し、続行する', async () => {
  const line = createFakeLine();
  line.fail(/^POST .*content$/, { applied: true });
  await line.publish();

  assert.equal(line.state.aliases.size, 1);
});

test('登録済みの画像が異なれば切り替え前に停止する', async () => {
  const line = await publishedLine();
  line.state.menus.get(line.first.menuIds.default).image = new Uint8Array([9]);

  await assert.rejects(line.publish(), /一致しません/);
  assert.deepEqual(line.writes(), []);
});

test('エイリアス切り替えの中断は旧版を残し、再実行で移行を完了する', async () => {
  const line = await publishedLine();
  line.fail(/^POST richmenu\/alias\/fuyugyo-instructor$/, { status: 500 });

  await assert.rejects(line.publish({ images: nextInstructor }), /LINE API/);
  assert.equal(line.state.aliases.get(ALIAS), line.first.menuIds.instructor);
  assert.equal(batchCalls(line).length, 0);

  const result = await line.publish({ images: nextInstructor });
  assert.deepEqual(result.deletedIds, [line.first.menuIds.instructor]);
  assert.equal(line.state.menus.size, 3);
});

test('エイリアス切り替え後に一括置換が応答しなくても、同じキーで再開する', async () => {
  const line = await publishedLine();
  line.fail(/^POST richmenu\/batch$/);
  line.fail(/^POST richmenu\/batch$/, { status: 500 });

  await assert.rejects(line.publish({ images: nextInstructor }), /旧版は保持/);
  assert.notEqual(line.state.aliases.get(ALIAS), line.first.menuIds.instructor);
  assert.ok(line.state.menus.has(line.first.menuIds.instructor));
  assert.equal(batchCalls(line).length, 2);

  const result = await line.publish({ images: nextInstructor });
  assert.equal(line.state.links.get('user-1'), result.menuIds.instructor);
  assert.deepEqual(result.deletedIds, [line.first.menuIds.instructor]);
});

test('一括置換が失敗した間は旧版を保持し、再実行は同じキーで再送する', async () => {
  const line = await publishedLine();
  line.state.batchOutcomes.push('failed', 'failed');

  await assert.rejects(line.publish({ images: nextInstructor }), /旧版は保持/);
  assert.ok(line.state.menus.has(line.first.menuIds.instructor));
  assert.ok(!line.state.calls.some((call) => call.startsWith('DELETE ')));

  await line.publish({ images: nextInstructor });
  const keys = [...line.state.batches.values()].map((batch) => batch.key);
  assert.equal(keys.length, 3);
  assert.equal(new Set(keys).size, 1);
  assert.ok(!line.state.menus.has(line.first.menuIds.instructor));
});

test('状態確認が時間切れなら保持し、既知のリクエスト ID は再送せず照会する', async () => {
  const line = await publishedLine();
  line.state.batchOutcomes.push('ongoing');
  await assert.rejects(line.publish({ images: nextInstructor }), /旧版は保持/);
  assert.ok(line.state.menus.has(line.first.menuIds.instructor));

  const hint = line.logs.find((message) => message.includes('batch_request_ids: '));
  const knownRequests = parseKnownRequests(hint.split('batch_request_ids: ')[1]);
  const [batch] = line.state.batches.values();
  batch.phase = 'succeeded';
  line.state.calls.length = 0;

  const result = await line.publish({ images: nextInstructor, knownRequests });
  assert.equal(batchCalls(line).length, 0);
  assert.deepEqual(result.deletedIds, [line.first.menuIds.instructor]);
});

test('期限切れのリクエスト ID と別の組の指定は、成功とみなさず再送する', async () => {
  const line = await publishedLine();
  const from = line.first.menuIds.instructor;
  line.state.batches.set('other', { phase: 'succeeded' });
  line.state.batchOutcomes.push('failed', 'failed');
  await assert.rejects(
    line.publish({
      images: nextInstructor,
      knownRequests: [{ from, to: 'richmenu-other', requestId: 'other' }],
    }),
    /旧版は保持/,
  );
  const to = line.state.aliases.get(ALIAS);
  line.state.calls.length = 0;

  await line.publish({
    images: nextInstructor,
    knownRequests: [{ from, to, requestId: 'expired' }],
  });
  assert.equal(batchCalls(line).length, 1);
});

test('レート制限では旧版を保持して再送しない', async () => {
  const line = await publishedLine();
  line.fail(/^POST richmenu\/batch$/, { status: 429 });

  await assert.rejects(line.publish({ images: nextInstructor }), /429/);
  assert.equal(batchCalls(line).length, 1);
  assert.ok(line.state.menus.has(line.first.menuIds.instructor));
});

test('移行が未完了のまま別の版は公開しない', async () => {
  const line = await publishedLine();
  line.state.batchOutcomes.push('ongoing');
  await assert.rejects(line.publish({ images: nextInstructor }), /旧版は保持/);
  line.state.calls.length = 0;

  const third = { ...images, instructor: new Uint8Array(Buffer.from('instructor-v3')) };
  await assert.rejects(line.publish({ images: third }), /前回の移行が完了していません/);
  assert.deepEqual(line.writes(), []);
});

test('割り当て停止を確認するまで、旧版がある公開は何も変更しない', async () => {
  const line = await publishedLine();

  await assert.rejects(
    line.publish({ images: nextInstructor, assignmentStopped: false }),
    /assignment_stopped/,
  );
  assert.deepEqual(line.writes(), []);
});

test('別のエイリアスが参照する旧版は削除しない', async () => {
  const line = await publishedLine();
  line.state.aliases.set('other-alias', line.first.menuIds.instructor);

  await assert.rejects(line.publish({ images: nextInstructor }), /参照されているため/);
  assert.ok(line.state.menus.has(line.first.menuIds.instructor));
});

test('削除の応答が失われても、一覧から消えていれば続行する', async () => {
  const line = await publishedLine();
  line.fail(/^DELETE richmenu\//, { applied: true });

  const result = await line.publish({ images: nextInstructor });
  assert.deepEqual(result.deletedIds, [line.first.menuIds.instructor]);
});

test('画像が未登録の旧版は削除せず保持する', async () => {
  const line = await publishedLine();
  const draft = `fuyugyo-richmenu:instructor:${'0'.repeat(64)}`;
  line.state.menus.set('richmenu-draft', { definition: { name: draft }, image: null });

  const result = await line.publish({ assignmentStopped: false });
  assert.deepEqual(result.retainedIds, ['richmenu-draft']);
  assert.ok(line.state.menus.has('richmenu-draft'));
});

test('同じ管理名が複数あれば公開を止める', async () => {
  const line = await publishedLine();
  const original = line.state.menus.get(line.first.menuIds.default);
  line.state.menus.set('richmenu-copy', { ...original });

  await assert.rejects(line.publish(), /複数あります/);
  assert.deepEqual(line.writes(), []);
});

test('公式アカウント ID が異なれば照合以外の要求を送らない', async () => {
  const line = createFakeLine();

  await assert.rejects(line.publish({ officialAccountId: '@other' }), /一致しません/);
  assert.deepEqual(line.state.calls, ['GET info']);
});

test('batch_request_ids は組とリクエスト ID の 3 項目だけを受け付ける', () => {
  assert.deepEqual(parseKnownRequests(''), []);
  assert.deepEqual(parseKnownRequests(' a:b:c , d:e:f '), [
    { from: 'a', to: 'b', requestId: 'c' },
    { from: 'd', to: 'e', requestId: 'f' },
  ]);
  assert.throws(() => parseKnownRequests('request-only'), /旧ID:新ID/);
  assert.throws(() => parseKnownRequests('a:b:c:d'), /旧ID:新ID/);
});

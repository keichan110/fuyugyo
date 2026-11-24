import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * 既存データを持つ本番相当の DB へ、データを変換・移送するマイグレーション
 * （0001・0002・0003・0006・0007・0008・0010）を順に適用して結果を検証する。
 *
 * 実際の `drizzle/*.sql` を書き換えずに、Wrangler のローカル D1（Miniflare）を
 * 専用の永続化ディレクトリで起動する。実テーブル名・外部キー・既存トリガーのまま
 * 検証し、開発用 D1（`.wrangler/state`）や他のテストの D1 には触れない。
 * 空の D1 へ全件を適用するだけの `test/apply-migrations.ts` では検出できない、
 * 「移行前の行が移行後も同じ意味で残るか」を確認するのが目的。
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const wrangler = join(root, 'node_modules', '.bin', 'wrangler');
const migrationsDir = join(root, 'drizzle');

/** 日付文字列を移行後の epoch 秒に直す。 */
const epoch = (iso) => Date.parse(iso) / 1000;

const D_SHIFT1 = epoch('2026-01-10T00:00:00.000Z');
const D_SHIFT2 = epoch('2026-01-11T00:00:00.000Z');
const D_AVAIL = epoch('2026-01-12T00:00:00.000Z');
const D_NEW = epoch('2026-01-20T00:00:00.000Z');

/** 独立したローカル D1 を作り、SQL とマイグレーションの適用を提供する。 */
function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'fuyugyo-migration-data-'));
  let sequence = 0;

  /** SQL を実行して、全文の結果（ステートメントごとの行配列）か失敗内容を返す。 */
  const run = (sqlText) => {
    const file = join(dir, `statement-${sequence++}.sql`);
    writeFileSync(file, sqlText);
    const result = spawnSync(
      wrangler,
      ['d1', 'execute', 'fuyugyo', '--local', '--persist-to', dir, '--json', '--file', file],
      { cwd: root, encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } },
    );
    return { ok: result.status === 0, output: `${result.stdout}${result.stderr}` };
  };

  /** 成功を前提に SQL を実行し、結果を持つステートメントの行だけを順に返す。 */
  const exec = (sqlText) => {
    const { ok, output } = run(sqlText);
    assert.ok(ok, `SQL の実行に失敗しました: ${output}`);
    return JSON.parse(output)
      .map((item) => item.results)
      .filter((rows) => rows.length > 0);
  };

  return {
    /** 指定したマイグレーションを、ファイルの内容のまま適用する。 */
    migrate(prefix) {
      const name = readdirSync(migrationsDir).find((file) => file.startsWith(`${prefix}_`));
      assert.ok(name, `マイグレーション ${prefix} が見つかりません`);
      exec(readFileSync(join(migrationsDir, name), 'utf8'));
    },
    exec,
    /** 1 件の SELECT 結果を返す。 */
    rows(sqlText) {
      return exec(sqlText)[0] ?? [];
    },
    /** 失敗するはずの SQL を実行し、エラー出力を返す。成功したら検証失敗にする。 */
    fails(sqlText) {
      const { ok, output } = run(sqlText);
      assert.equal(ok, false, `失敗するはずの SQL が成功しました: ${sqlText}`);
      return output;
    },
    /** 外部キー違反の行数。移行直後は常に 0 でなければならない。 */
    foreignKeyViolations() {
      return exec('SELECT count(*) AS n FROM pragma_foreign_key_check;')[0][0].n;
    },
    dispose() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

// 全移行後の講師の期待値。投入した値のうち日時だけが epoch 秒へ変わり、移行で増えた列は無い。
const EXPECTED_INSTRUCTORS = [
  {
    id: 'i-1',
    last_name: '山田',
    first_name: '太郎',
    last_name_kana: null,
    first_name_kana: null,
    status: 'ACTIVE',
    notes: '備考1',
    created_at: epoch('2025-11-05T00:00:00.000Z'),
    updated_at: epoch('2025-11-06T00:00:00.000Z'),
  },
  {
    id: 'i-2',
    last_name: '佐藤',
    first_name: '花子',
    last_name_kana: null,
    first_name_kana: null,
    status: 'INACTIVE',
    notes: null,
    created_at: epoch('2025-11-05T00:00:00.000Z'),
    updated_at: epoch('2025-11-05T00:00:00.000Z'),
  },
];
// 全移行後の資格の期待値。投入した値のうち日時だけが epoch 秒へ変わり、移行で増えた列は無い。
// 無効（is_active = 0）の資格が有効へ変わらないことと、既に整数だった日時が保たれることを含む。
const EXPECTED_CERTIFICATIONS = [
  {
    id: 'cert-ski-1',
    department_code: 'ski',
    name: 'スキー1級',
    short_name: 'S1',
    organization: 'SAJ',
    description: '最上位の級',
    is_active: 1,
    created_at: epoch('2025-11-03T00:00:00.000Z'),
    updated_at: epoch('2025-11-04T00:00:00.000Z'),
  },
  {
    id: 'cert-ski-2',
    department_code: 'ski',
    name: 'スキー2級',
    short_name: 'S2',
    organization: 'SAJ',
    description: null,
    is_active: 1,
    created_at: 1762128000,
    updated_at: 1762128000,
  },
  {
    id: 'cert-ski-3',
    department_code: 'ski',
    name: 'スキー3級',
    short_name: 'S3',
    organization: 'SAJ',
    description: null,
    is_active: 1,
    created_at: epoch('2025-11-03T00:00:00.000Z'),
    updated_at: epoch('2025-11-03T00:00:00.000Z'),
  },
  {
    id: 'cert-snow-1',
    department_code: 'snowboard',
    name: 'SB1級',
    short_name: 'B1',
    organization: 'JSBA',
    description: null,
    is_active: 0,
    created_at: epoch('2025-11-03T00:00:00.000Z'),
    updated_at: epoch('2025-11-03T00:00:00.000Z'),
  },
];
// 全移行後のユーザーの期待値。picture_url は投入していないため null のまま。
const EXPECTED_USERS = [
  {
    id: 'u-1',
    line_user_id: 'line-1',
    display_name: '管理者',
    picture_url: null,
    role: 'ADMIN',
    is_active: 1,
    instructor_id: 'i-1',
    created_at: epoch('2025-11-08T00:00:00.000Z'),
    updated_at: epoch('2025-11-08T00:00:00.000Z'),
  },
];

test('既存データの移行で ID・値・日時・配置・資格が保たれる', async (t) => {
  const db = createDatabase();
  t.after(() => db.dispose());

  await t.test('0000 の旧スキーマへ旧 Prisma 形式（ISO 日時の文字列）の既存データを入れる', () => {
    db.migrate('0000');
    db.exec(`
      INSERT INTO departments (id, code, name, description, is_active, created_at, updated_at) VALUES
        ('dep-ski', 'ski', 'スキー', '旧部門', 1, '2025-11-01T01:02:03.000Z', '2025-11-02T01:02:03.000Z'),
        ('dep-snow', 'snowboard', 'スノーボード', NULL, 1, '2025-11-01T01:02:03.000Z', '2025-11-01T01:02:03.000Z');
      INSERT INTO certifications (id, department_id, name, short_name, organization, description, is_active, created_at, updated_at) VALUES
        ('cert-ski-1', 'dep-ski', 'スキー1級', 'S1', 'SAJ', '最上位の級', 1, '2025-11-03T00:00:00.000Z', '2025-11-04T00:00:00.000Z'),
        ('cert-ski-2', 'dep-ski', 'スキー2級', 'S2', 'SAJ', NULL, 1, 1762128000, 1762128000),
        ('cert-ski-3', 'dep-ski', 'スキー3級', 'S3', 'SAJ', NULL, 1, '2025-11-03T00:00:00.000Z', '2025-11-03T00:00:00.000Z'),
        ('cert-snow-1', 'dep-snow', 'SB1級', 'B1', 'JSBA', NULL, 0, '2025-11-03T00:00:00.000Z', '2025-11-03T00:00:00.000Z');
      INSERT INTO instructors (id, last_name, first_name, status, notes, created_at, updated_at) VALUES
        ('i-1', '山田', '太郎', 'ACTIVE', '備考1', '2025-11-05T00:00:00.000Z', '2025-11-06T00:00:00.000Z'),
        ('i-2', '佐藤', '花子', 'INACTIVE', NULL, '2025-11-05T00:00:00.000Z', '2025-11-05T00:00:00.000Z');
      INSERT INTO instructor_certifications (id, instructor_id, certification_id, created_at, updated_at) VALUES
        ('ic-1', 'i-1', 'cert-ski-1', '2025-11-07T00:00:00.000Z', '2025-11-07T00:00:00.000Z'),
        ('ic-2', 'i-1', 'cert-ski-2', '2025-11-07T00:00:00.000Z', '2025-11-07T00:00:00.000Z'),
        ('ic-3', 'i-2', 'cert-snow-1', '2025-11-07T00:00:00.000Z', '2025-11-07T00:00:00.000Z');
      INSERT INTO shift_types (id, name, is_active, created_at, updated_at) VALUES
        ('st-lesson', 'レッスン', 1, '2025-11-01T00:00:00.000Z', '2025-11-01T00:00:00.000Z'),
        ('st-event', 'イベント', 1, '2025-11-01T00:00:00.000Z', '2025-11-01T00:00:00.000Z');
      INSERT INTO shifts (id, date, department_id, shift_type_id, description, created_at, updated_at) VALUES
        ('sh-1', '2026-01-10T00:00:00.000Z', 'dep-ski', 'st-lesson', '朝の備考', '2025-12-01T00:00:00.000Z', '2025-12-02T00:00:00.000Z'),
        ('sh-2', '2026-01-11T00:00:00.000Z', 'dep-snow', 'st-lesson', NULL, '2025-12-01T00:00:00.000Z', '2025-12-01T00:00:00.000Z'),
        ('sh-3', '2026-01-10T00:00:00.000Z', 'dep-ski', 'st-event', NULL, '2025-12-01T00:00:00.000Z', '2025-12-01T00:00:00.000Z');
      INSERT INTO shift_assignments (id, shift_id, instructor_id, assigned_at) VALUES
        ('as-1', 'sh-1', 'i-1', '2026-01-05T09:00:00.000Z'),
        ('as-2', 'sh-1', 'i-2', '2026-01-05T09:30:00.000Z'),
        ('as-3', 'sh-2', 'i-2', '2026-01-06T09:00:00.000Z');
      INSERT INTO users (id, line_user_id, display_name, role, is_active, instructor_id, created_at, updated_at) VALUES
        ('u-1', 'line-1', '管理者', 'ADMIN', 1, 'i-1', '2025-11-08T00:00:00.000Z', '2025-11-08T00:00:00.000Z');
      INSERT INTO invitation_tokens (token, expires_at, is_active, created_by, max_uses, used_count, description, created_at, updated_at) VALUES
        ('tok-1', '2026-02-01T00:00:00.000Z', 1, 'u-1', 5, 2, '招待', '2025-11-09T00:00:00.000Z', '2025-11-09T00:00:00.000Z');
    `);
    assert.equal(db.foreignKeyViolations(), 0);
  });

  await t.test('0001: ISO 日時が epoch 秒へ変わり、既に整数の値は変わらない', () => {
    db.migrate('0001');
    assert.deepEqual(
      db.rows(
        `SELECT id, typeof(created_at) AS ct, created_at, updated_at FROM departments ORDER BY id`,
      ),
      [
        {
          id: 'dep-ski',
          ct: 'integer',
          created_at: epoch('2025-11-01T01:02:03.000Z'),
          updated_at: epoch('2025-11-02T01:02:03.000Z'),
        },
        {
          id: 'dep-snow',
          ct: 'integer',
          created_at: epoch('2025-11-01T01:02:03.000Z'),
          updated_at: epoch('2025-11-01T01:02:03.000Z'),
        },
      ],
    );
    // 既に integer だった行は冪等に保たれ、同じ表の ISO 行だけが変換される。
    assert.deepEqual(db.rows(`SELECT id, created_at, updated_at FROM certifications ORDER BY id`), [
      {
        id: 'cert-ski-1',
        created_at: epoch('2025-11-03T00:00:00.000Z'),
        updated_at: epoch('2025-11-04T00:00:00.000Z'),
      },
      { id: 'cert-ski-2', created_at: 1762128000, updated_at: 1762128000 },
      {
        id: 'cert-ski-3',
        created_at: epoch('2025-11-03T00:00:00.000Z'),
        updated_at: epoch('2025-11-03T00:00:00.000Z'),
      },
      {
        id: 'cert-snow-1',
        created_at: epoch('2025-11-03T00:00:00.000Z'),
        updated_at: epoch('2025-11-03T00:00:00.000Z'),
      },
    ]);
    // 0001 は部門・資格以外の表の日時も変換する。値の列は変わらない。
    assert.deepEqual(db.rows(`SELECT id, created_at, updated_at FROM instructors ORDER BY id`), [
      {
        id: 'i-1',
        created_at: epoch('2025-11-05T00:00:00.000Z'),
        updated_at: epoch('2025-11-06T00:00:00.000Z'),
      },
      {
        id: 'i-2',
        created_at: epoch('2025-11-05T00:00:00.000Z'),
        updated_at: epoch('2025-11-05T00:00:00.000Z'),
      },
    ]);
    assert.deepEqual(
      db.rows(`SELECT id, created_at, updated_at FROM instructor_certifications ORDER BY id`),
      ['ic-1', 'ic-2', 'ic-3'].map((id) => ({
        id,
        created_at: epoch('2025-11-07T00:00:00.000Z'),
        updated_at: epoch('2025-11-07T00:00:00.000Z'),
      })),
    );
    assert.deepEqual(
      db.rows(`SELECT id, name, is_active, created_at, updated_at FROM shift_types ORDER BY id`),
      ['st-event', 'st-lesson'].map((id) => ({
        id,
        name: id === 'st-event' ? 'イベント' : 'レッスン',
        is_active: 1,
        created_at: epoch('2025-11-01T00:00:00.000Z'),
        updated_at: epoch('2025-11-01T00:00:00.000Z'),
      })),
    );
    assert.deepEqual(
      db.rows(`SELECT id, role, line_user_id, created_at, updated_at FROM users ORDER BY id`),
      [
        {
          id: 'u-1',
          role: 'ADMIN',
          line_user_id: 'line-1',
          created_at: epoch('2025-11-08T00:00:00.000Z'),
          updated_at: epoch('2025-11-08T00:00:00.000Z'),
        },
      ],
    );
    assert.deepEqual(db.rows(`SELECT id, date, created_at FROM shifts ORDER BY id`), [
      { id: 'sh-1', date: D_SHIFT1, created_at: epoch('2025-12-01T00:00:00.000Z') },
      { id: 'sh-2', date: D_SHIFT2, created_at: epoch('2025-12-01T00:00:00.000Z') },
      { id: 'sh-3', date: D_SHIFT1, created_at: epoch('2025-12-01T00:00:00.000Z') },
    ]);
    assert.deepEqual(db.rows(`SELECT id, assigned_at FROM shift_assignments ORDER BY id`), [
      { id: 'as-1', assigned_at: epoch('2026-01-05T09:00:00.000Z') },
      { id: 'as-2', assigned_at: epoch('2026-01-05T09:30:00.000Z') },
      { id: 'as-3', assigned_at: epoch('2026-01-06T09:00:00.000Z') },
    ]);
    assert.deepEqual(db.rows(`SELECT token, expires_at, created_at FROM invitation_tokens`), [
      {
        token: 'tok-1',
        expires_at: epoch('2026-02-01T00:00:00.000Z'),
        created_at: epoch('2025-11-09T00:00:00.000Z'),
      },
    ]);
    assert.equal(db.foreignKeyViolations(), 0);
  });

  await t.test('0002: 部門 ID がコードへ置き換わり、枠・配置・資格・ユーザー紐付けが残る', () => {
    db.migrate('0002');
    // 表の作り直しで全列（無効資格・説明・日時を含む）が投入値のまま移る。
    assert.deepEqual(db.rows(`SELECT * FROM certifications ORDER BY id`), EXPECTED_CERTIFICATIONS);
    assert.deepEqual(
      db.rows(
        `SELECT id, date, department_code, shift_type_id, description FROM shifts ORDER BY id`,
      ),
      [
        {
          id: 'sh-1',
          date: D_SHIFT1,
          department_code: 'ski',
          shift_type_id: 'st-lesson',
          description: '朝の備考',
        },
        {
          id: 'sh-2',
          date: D_SHIFT2,
          department_code: 'snowboard',
          shift_type_id: 'st-lesson',
          description: null,
        },
        {
          id: 'sh-3',
          date: D_SHIFT1,
          department_code: 'ski',
          shift_type_id: 'st-event',
          description: null,
        },
      ],
    );
    // shifts を作り直す間に配置が連鎖削除されず、ID・担当者・割当日時が同じまま戻っている。
    assert.deepEqual(
      db.rows(`SELECT id, shift_id, instructor_id, assigned_at FROM shift_assignments ORDER BY id`),
      [
        {
          id: 'as-1',
          shift_id: 'sh-1',
          instructor_id: 'i-1',
          assigned_at: epoch('2026-01-05T09:00:00.000Z'),
        },
        {
          id: 'as-2',
          shift_id: 'sh-1',
          instructor_id: 'i-2',
          assigned_at: epoch('2026-01-05T09:30:00.000Z'),
        },
        {
          id: 'as-3',
          shift_id: 'sh-2',
          instructor_id: 'i-2',
          assigned_at: epoch('2026-01-06T09:00:00.000Z'),
        },
      ],
    );
    assert.deepEqual(
      db.rows(
        `SELECT id, instructor_id, certification_id FROM instructor_certifications ORDER BY id`,
      ),
      [
        { id: 'ic-1', instructor_id: 'i-1', certification_id: 'cert-ski-1' },
        { id: 'ic-2', instructor_id: 'i-1', certification_id: 'cert-ski-2' },
        { id: 'ic-3', instructor_id: 'i-2', certification_id: 'cert-snow-1' },
      ],
    );
    assert.deepEqual(db.rows(`SELECT id, instructor_id FROM users`), [
      { id: 'u-1', instructor_id: 'i-1' },
    ]);
    // 移行用の退避テーブルと旧部門テーブルは残らない。
    const tables = db
      .rows(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .map((row) => row.name);
    assert.equal(tables.includes('departments'), false);
    assert.equal(
      tables.some((name) => name.startsWith('__backup_')),
      false,
    );
    assert.equal(db.foreignKeyViolations(), 0);
  });

  await t.test('0003: 既存のシフト種別から部門ごとの枠が作られ、並びが名前順になる', () => {
    db.migrate('0003');
    assert.deepEqual(
      db.rows(
        `SELECT department_code, shift_type_id, sort_order FROM department_shift_types ORDER BY department_code, sort_order`,
      ),
      [
        { department_code: 'ski', shift_type_id: 'st-event', sort_order: 1 },
        { department_code: 'ski', shift_type_id: 'st-lesson', sort_order: 2 },
        { department_code: 'snowboard', shift_type_id: 'st-event', sort_order: 1 },
        { department_code: 'snowboard', shift_type_id: 'st-lesson', sort_order: 2 },
      ],
    );
    // 既存のシフト種別には手を入れない。
    assert.deepEqual(db.rows(`SELECT id, name FROM shift_types ORDER BY id`), [
      { id: 'st-event', name: 'イベント' },
      { id: 'st-lesson', name: 'レッスン' },
    ]);
    assert.equal(db.foreignKeyViolations(), 0);
  });

  await t.test('0004・0005: 申告表と資格要件表（旧 level）を作り、既存データを入れる', () => {
    db.migrate('0004');
    db.migrate('0005');
    db.exec(`
      INSERT INTO instructor_availabilities (id, instructor_id, date, type, note) VALUES
        ('av-1', 'i-1', ${D_AVAIL}, 'UNAVAILABLE', '家庭の事情');
      INSERT INTO department_shift_type_certifications (id, department_shift_type_id, certification_id, level) VALUES
        ('req-1', (SELECT id FROM department_shift_types WHERE department_code = 'ski' AND shift_type_id = 'st-lesson'), 'cert-ski-1', 10),
        ('req-2', (SELECT id FROM department_shift_types WHERE department_code = 'ski' AND shift_type_id = 'st-lesson'), 'cert-ski-2', 30),
        ('req-3', (SELECT id FROM department_shift_types WHERE department_code = 'ski' AND shift_type_id = 'st-lesson'), 'cert-ski-3', 30),
        ('req-4', (SELECT id FROM department_shift_types WHERE department_code = 'snowboard' AND shift_type_id = 'st-lesson'), 'cert-snow-1', 5);
    `);
    assert.equal(db.foreignKeyViolations(), 0);
  });

  await t.test('0006: 表名が資格要件へ変わり、行と level が保たれる', () => {
    db.migrate('0006');
    assert.deepEqual(
      db.rows(`SELECT id, certification_id, level FROM certification_requirements ORDER BY id`),
      [
        { id: 'req-1', certification_id: 'cert-ski-1', level: 10 },
        { id: 'req-2', certification_id: 'cert-ski-2', level: 30 },
        { id: 'req-3', certification_id: 'cert-ski-3', level: 30 },
        { id: 'req-4', certification_id: 'cert-snow-1', level: 5 },
      ],
    );
    assert.equal(db.foreignKeyViolations(), 0);
  });

  await t.test('0007: level が枠ごとの tier_rank（高い順、同値は同順位）へ変換される', () => {
    db.migrate('0007');
    assert.deepEqual(db.rows(`SELECT id, tier_rank FROM certification_requirements ORDER BY id`), [
      { id: 'req-1', tier_rank: 2 },
      { id: 'req-2', tier_rank: 1 },
      { id: 'req-3', tier_rank: 1 },
      { id: 'req-4', tier_rank: 1 },
    ]);
    // 一時的な順位表は残らない。
    assert.deepEqual(
      db.rows(
        `SELECT name FROM sqlite_master WHERE name = 'certification_requirement_tier_ranks_migration'`,
      ),
      [],
    );
  });

  await t.test('0008: 行を保ったまま tier_rank > 0 の制約が加わる', () => {
    db.migrate('0008');
    assert.deepEqual(
      db.rows(`SELECT id, certification_id, tier_rank FROM certification_requirements ORDER BY id`),
      [
        { id: 'req-1', certification_id: 'cert-ski-1', tier_rank: 2 },
        { id: 'req-2', certification_id: 'cert-ski-2', tier_rank: 1 },
        { id: 'req-3', certification_id: 'cert-ski-3', tier_rank: 1 },
        { id: 'req-4', certification_id: 'cert-snow-1', tier_rank: 1 },
      ],
    );
    const output = db.fails(
      `UPDATE certification_requirements SET tier_rank = 0 WHERE id = 'req-1';`,
    );
    assert.match(output, /CHECK|constraint/i);
    assert.equal(
      db.rows(`SELECT tier_rank FROM certification_requirements WHERE id = 'req-1'`)[0].tier_rank,
      2,
    );
    assert.equal(db.foreignKeyViolations(), 0);
  });

  await t.test('0009: 旧必要人数の表を作り、移行前の必要人数を入れる', () => {
    db.migrate('0009');
    db.exec(`
      INSERT INTO shift_staffing_requirements (id, date, department_code, shift_type_id, required_count) VALUES
        ('ss-1', ${D_SHIFT1}, 'ski', 'st-lesson', 3),
        ('ss-2', ${D_SHIFT2}, 'snowboard', 'st-lesson', 0);
    `);
    assert.equal(db.rows(`SELECT count(*) AS n FROM shift_staffing_requirements`)[0].n, 2);
  });

  await t.test('0010: 既存枠は公開済みになり、旧必要人数は破棄され、配置と日時は保たれる', () => {
    db.migrate('0010');
    // 既存の枠は ID・備考・日時・種別を保ったまま公開済み・世代 0 へ移る。
    assert.deepEqual(
      db.rows(
        `SELECT id, date, department_code, shift_type_id, description, status, revision, created_at, updated_at FROM shifts ORDER BY id`,
      ),
      [
        {
          id: 'sh-1',
          date: D_SHIFT1,
          department_code: 'ski',
          shift_type_id: 'st-lesson',
          description: '朝の備考',
          status: 'PUBLISHED',
          revision: 0,
          created_at: epoch('2025-12-01T00:00:00.000Z'),
          updated_at: epoch('2025-12-02T00:00:00.000Z'),
        },
        {
          id: 'sh-2',
          date: D_SHIFT2,
          department_code: 'snowboard',
          shift_type_id: 'st-lesson',
          description: null,
          status: 'PUBLISHED',
          revision: 0,
          created_at: epoch('2025-12-01T00:00:00.000Z'),
          updated_at: epoch('2025-12-01T00:00:00.000Z'),
        },
        {
          id: 'sh-3',
          date: D_SHIFT1,
          department_code: 'ski',
          shift_type_id: 'st-event',
          description: null,
          status: 'PUBLISHED',
          revision: 0,
          created_at: epoch('2025-12-01T00:00:00.000Z'),
          updated_at: epoch('2025-12-01T00:00:00.000Z'),
        },
      ],
    );
    // 旧必要人数（3 名・0 名）は新しい `shifts.required_count` へ引き継がれず、
    // 元の表ごと破棄される。保持できたものとして扱わない（再入力が必要）。
    assert.deepEqual(db.rows(`SELECT id, required_count FROM shifts ORDER BY id`), [
      { id: 'sh-1', required_count: null },
      { id: 'sh-2', required_count: null },
      { id: 'sh-3', required_count: null },
    ]);
    assert.deepEqual(
      db.rows(`SELECT name FROM sqlite_master WHERE name = 'shift_staffing_requirements'`),
      [],
    );
    // 配置・申告・資格要件は移行の影響を受けない。
    assert.deepEqual(
      db.rows(`SELECT id, shift_id, instructor_id FROM shift_assignments ORDER BY id`),
      [
        { id: 'as-1', shift_id: 'sh-1', instructor_id: 'i-1' },
        { id: 'as-2', shift_id: 'sh-1', instructor_id: 'i-2' },
        { id: 'as-3', shift_id: 'sh-2', instructor_id: 'i-2' },
      ],
    );
    assert.deepEqual(
      db.rows(`SELECT id, instructor_id, date, type, note FROM instructor_availabilities`),
      [
        {
          id: 'av-1',
          instructor_id: 'i-1',
          date: D_AVAIL,
          type: 'UNAVAILABLE',
          note: '家庭の事情',
        },
      ],
    );
    assert.equal(db.rows(`SELECT count(*) AS n FROM certification_requirements`)[0].n, 4);
    assert.equal(db.foreignKeyViolations(), 0);
  });

  await t.test(
    '0010 後: 新規枠は下書きで始まり、公開済みの配置日の申告変更はトリガーが拒否する',
    () => {
      db.exec(`
      INSERT INTO shifts (id, date, department_code, shift_type_id) VALUES ('sh-new', ${D_NEW}, 'ski', 'st-lesson');
    `);
      assert.deepEqual(
        db.rows(`SELECT status, revision, required_count FROM shifts WHERE id = 'sh-new'`),
        [{ status: 'DRAFT', revision: 0, required_count: null }],
      );
      const triggers = db
        .rows(`SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`)
        .map((row) => row.name);
      assert.deepEqual(triggers, [
        'availability_check_published_before_insert',
        'availability_check_published_before_update',
        'shifts_check_availability_before_publish',
      ]);

      // 移行で公開済みになった sh-1（i-1 配置）の日へ新しい勤務不可を入れる。
      const insertOutput = db.fails(
        `INSERT INTO instructor_availabilities (id, instructor_id, date, type) VALUES ('av-bad', 'i-1', ${D_SHIFT1}, 'UNAVAILABLE');`,
      );
      assert.match(insertOutput, /availability_published_assignment/);
      // 既存の申告を公開済みの配置日へ付け替えることも拒否され、元の行は変わらない。
      const updateOutput = db.fails(
        `UPDATE instructor_availabilities SET date = ${D_SHIFT1} WHERE id = 'av-1';`,
      );
      assert.match(updateOutput, /availability_published_assignment/);
      assert.deepEqual(db.rows(`SELECT id, date FROM instructor_availabilities ORDER BY id`), [
        { id: 'av-1', date: D_AVAIL },
      ]);

      // 下書きの枠に配置した人が勤務不可なら公開できず、状態は下書きのまま。
      db.exec(`
      INSERT INTO shift_assignments (id, shift_id, instructor_id) VALUES ('as-new', 'sh-new', 'i-2');
      INSERT INTO instructor_availabilities (id, instructor_id, date, type) VALUES ('av-new', 'i-2', ${D_NEW}, 'UNAVAILABLE');
    `);
      const publishOutput = db.fails(`UPDATE shifts SET status = 'PUBLISHED' WHERE id = 'sh-new';`);
      assert.match(publishOutput, /shift_publish_unavailable/);
      assert.deepEqual(db.rows(`SELECT status FROM shifts WHERE id = 'sh-new'`), [
        { status: 'DRAFT' },
      ]);
    },
  );

  await t.test('0011: 天気テーブルを追加しても既存データと外部キー整合性が保たれる', () => {
    db.migrate('0011');
    assert.equal(db.rows(`SELECT count(*) AS n FROM shifts`)[0].n, 4);
    assert.equal(db.rows(`SELECT count(*) AS n FROM shift_assignments`)[0].n, 4);
    // 全移行を通した後も、資格・講師・ユーザーの全列が投入した値（日時は変換後）のまま残る。
    assert.deepEqual(db.rows(`SELECT * FROM certifications ORDER BY id`), EXPECTED_CERTIFICATIONS);
    assert.deepEqual(db.rows(`SELECT * FROM instructors ORDER BY id`), EXPECTED_INSTRUCTORS);
    assert.deepEqual(db.rows(`SELECT * FROM users ORDER BY id`), EXPECTED_USERS);
    assert.equal(db.foreignKeyViolations(), 0);
  });
});

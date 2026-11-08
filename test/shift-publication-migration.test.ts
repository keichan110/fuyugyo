import { env } from 'cloudflare:test';
import { expect, it } from 'vitest';

it('既存の枠・配置・IDを維持し、公開済み・必要人数未設定へ移行する', async () => {
  // 同じD1内で別名の移行前テーブルを用意し、生成SQLそのものを適用する。
  const source = env.TEST_MIGRATIONS.find((item) => item.name === '0010_abnormal_dagger.sql');
  if (!source) throw new Error('公開機能のマイグレーションがありません');
  const migration = source.queries.join('\n--> statement-breakpoint\n');
  const prefix = 'publication_migration_';
  await env.DB.prepare(
    `CREATE TABLE ${prefix}shifts (id TEXT PRIMARY KEY, date INTEGER, department_code TEXT, shift_type_id TEXT, description TEXT, created_at INTEGER, updated_at INTEGER)`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE ${prefix}shift_assignments (id TEXT PRIMARY KEY, shift_id TEXT REFERENCES ${prefix}shifts(id) ON DELETE CASCADE)`,
  ).run();
  await env.DB.prepare(`CREATE TABLE ${prefix}shift_staffing_requirements (id TEXT)`).run();
  await env.DB.prepare(
    `CREATE TABLE ${prefix}instructor_availabilities (instructor_id TEXT, date INTEGER, type TEXT)`,
  ).run();
  await env.DB.prepare(
    `INSERT INTO ${prefix}shifts VALUES ('existing', 1800000000, 'ski', 'lesson', '既存の備考', 1, 2)`,
  ).run();
  await env.DB.prepare(
    `INSERT INTO ${prefix}shift_assignments VALUES ('assignment', 'existing')`,
  ).run();
  const isolatedMigration = migration
    .replace(
      /\b(shifts|shift_assignments|shift_staffing_requirements|instructor_availabilities)\b/g,
      (table) => `${prefix}${table}`,
    )
    .replace(
      /`(shifts_check_availability_before_publish|availability_check_published_before_insert|availability_check_published_before_update)`/g,
      (_match: string, name: string) => `\`${prefix}${name}\``,
    );
  for (const statement of isolatedMigration.split('--> statement-breakpoint')) {
    if (statement.trim()) await env.DB.prepare(statement).run();
  }
  expect(
    await env.DB.prepare(
      `SELECT id, status, required_count, revision, description, created_at, updated_at FROM ${prefix}shifts`,
    ).first(),
  ).toEqual({
    id: 'existing',
    status: 'PUBLISHED',
    required_count: null,
    revision: 0,
    description: '既存の備考',
    created_at: 1,
    updated_at: 2,
  });
  expect(await env.DB.prepare(`SELECT * FROM ${prefix}shift_assignments`).first()).toEqual({
    id: 'assignment',
    shift_id: 'existing',
  });
  await env.DB.prepare(`INSERT INTO ${prefix}shifts (id) VALUES ('new')`).run();
  expect(
    await env.DB.prepare(`SELECT status FROM ${prefix}shifts WHERE id = 'new'`).first(),
  ).toEqual({ status: 'DRAFT' });
});

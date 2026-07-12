import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { shiftAgendaResponseSchema, shiftViewResponseSchema } from '../src/features/shifts/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import { instructors, shiftAssignments, shifts, shiftTypes, users } from '../src/server/db/schema';
import type { Env } from '../src/server/types';

/**
 * シフト表示ビュー（週次/月次）の統合テスト（実 D1）。
 * Hono の HTTP 境界 × 実 D1 を継ぎ目とし、期間絞り込み・集計値（件数・割り当て総数・
 * 部門別）・認可を検証する。集計の純粋関数自体は shift-aggregators.test.ts で網羅する。
 */

function envWith(overrides: Partial<Env>): Env {
  return { ...(env as unknown as Env), ...overrides };
}

function authHeader(token: string): RequestInit {
  return { headers: { cookie: `auth-token=${token}` } };
}

function authJsonRequest(token: string, body: unknown): RequestInit {
  return {
    headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function seedToken(role: 'MANAGER' | 'MEMBER' = 'MEMBER'): Promise<string> {
  const db = createDb(env.DB);
  const [user] = await db
    .insert(users)
    .values({
      lineUserId: `line-${crypto.randomUUID()}`,
      displayName: `テスト${role}`,
      role,
      isActive: true,
    })
    .returning();
  if (!user) {
    throw new Error('seedToken: user insert failed');
  }
  return await signJwt(
    {
      userId: user.id,
      lineUserId: user.lineUserId,
      displayName: user.displayName,
      role,
      isActive: true,
    },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN,
  );
}

async function seedDepartment(name: string, code: string): Promise<string> {
  return name.includes('スノ') || code.toLowerCase().includes('snb') ? 'snowboard' : 'ski';
}

async function seedShiftType(name = '終日'): Promise<string> {
  const db = createDb(env.DB);
  const [st] = await db.insert(shiftTypes).values({ name, isActive: true }).returning();
  if (!st) {
    throw new Error('seedShiftType: insert failed');
  }
  return st.id;
}

async function seedInstructor(lastName: string, firstName: string): Promise<string> {
  const db = createDb(env.DB);
  const [inst] = await db
    .insert(instructors)
    .values({ lastName, firstName, status: 'ACTIVE' })
    .returning();
  if (!inst) {
    throw new Error('seedInstructor: insert failed');
  }
  return inst.id;
}

/** 指定日（YYYY-MM-DD）にシフトを直接 INSERT し、割り当てを付与する */
async function seedShift(
  dateStr: string,
  departmentCode: string,
  shiftTypeId: string,
  instructorIds: string[] = [],
): Promise<string> {
  const db = createDb(env.DB);
  const shiftId = crypto.randomUUID();
  await db.insert(shifts).values({
    id: shiftId,
    date: new Date(`${dateStr}T00:00:00.000Z`),
    departmentCode,
    shiftTypeId,
    description: null,
  });
  for (const instructorId of instructorIds) {
    await db.insert(shiftAssignments).values({ shiftId, instructorId });
  }
  return shiftId;
}

beforeEach(async () => {
  const db = createDb(env.DB);
  await db.delete(shiftAssignments);
  await db.delete(shifts);
  await db.delete(shiftTypes);
  await db.delete(instructors);
  await db.delete(users);
});

// ─── GET /api/shifts/calendar ─────────────────────────────────────────────

describe('GET /api/shifts/calendar', () => {
  it('指定月の全シフトとサマリを返し、前後月は含まない', async () => {
    const ski = await seedDepartment('スキー', 'ski');
    const snb = await seedDepartment('スノーボード', 'snowboard');
    const st = await seedShiftType();
    const inst = await seedInstructor('山田', '太郎');
    // 2026-01 に3件（月初・月中・月末）、前月末と翌月初に各1件
    await seedShift('2026-01-01', ski, st, [inst]);
    await seedShift('2026-01-15', snb, st, [inst]);
    await seedShift('2026-01-31', ski, st, []);
    await seedShift('2025-12-31', ski, st, [inst]); // 前月
    await seedShift('2026-02-01', ski, st, [inst]); // 翌月
    const token = await seedToken('MEMBER');

    const res = await app.request(
      '/api/shifts/calendar?month=2026-01',
      authHeader(token),
      envWith({}),
    );
    expect(res.status).toBe(200);
    const body = shiftViewResponseSchema.parse(await res.json());

    expect(body.shifts).toHaveLength(3);
    expect(body.summary.totalShifts).toBe(3);
    expect(body.summary.totalAssignments).toBe(2);
    expect(body.summary.dateRange).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
    });
    expect(body.summary.byDepartment).toEqual({ スキー: 2, スノーボード: 1 });
  });

  it('シフト・割り当てが D1 のバインドパラメータ上限（100個）を超えても取得できる', async () => {
    // 1部門 × 4シフト種別 × 31日 = 124件のシフトを1回の月次一括 upsert で作成する。
    // shiftId の inArray に頼ると 100 個を超えるバインドパラメータでクエリが失敗するため、
    // JOIN ベースの絞り込みへ書き換えたことの回帰テストとして、意図的に上限超えの件数を用意する。
    const ski = await seedDepartment('スキー', 'ski');
    const shiftTypeIds = await Promise.all([
      seedShiftType('午前'),
      seedShiftType('午後'),
      seedShiftType('終日'),
      seedShiftType('夜間'),
    ]);
    const inst = await seedInstructor('山田', '太郎');
    const managerToken = await seedToken('MANAGER');

    const cells = [];
    for (let day = 1; day <= 31; day++) {
      const date = `2026-01-${String(day).padStart(2, '0')}`;
      for (const shiftTypeId of shiftTypeIds) {
        cells.push({ date, shiftTypeId, instructorIds: [inst] });
      }
    }
    expect(cells.length).toBeGreaterThan(100);

    const upsertRes = await app.request(
      '/api/shifts/assignments',
      {
        method: 'PUT',
        ...authJsonRequest(managerToken, { month: '2026-01', departmentCode: ski, cells }),
      },
      envWith({}),
    );
    expect(upsertRes.status).toBe(200);

    const memberToken = await seedToken('MEMBER');
    const res = await app.request(
      '/api/shifts/calendar?month=2026-01',
      authHeader(memberToken),
      envWith({}),
    );
    expect(res.status).toBe(200);
    const body = shiftViewResponseSchema.parse(await res.json());

    expect(body.shifts).toHaveLength(cells.length);
    expect(body.summary.totalShifts).toBe(cells.length);
    expect(body.summary.totalAssignments).toBe(cells.length);
    // 全シフトに割り当てが正しく紐づいている（JOIN 条件の絞り込み漏れがない）ことを確認する
    expect(
      body.shifts.every(
        (shift) =>
          shift.assignedInstructors.length === 1 && shift.assignedInstructors[0]?.id === inst,
      ),
    ).toBe(true);
  });

  it('month が不正形式・範囲外は 400 を返す', async () => {
    const token = await seedToken('MEMBER');
    const bad = await app.request(
      '/api/shifts/calendar?month=2026-1',
      authHeader(token),
      envWith({}),
    );
    expect(bad.status).toBe(400);
    const outOfRange = await app.request(
      '/api/shifts/calendar?month=2026-13',
      authHeader(token),
      envWith({}),
    );
    expect(outOfRange.status).toBe(400);
  });

  it('未認証は 401 を返す', async () => {
    const res = await app.request('/api/shifts/calendar?month=2026-01', {}, envWith({}));
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/shifts/agenda ──────────────────────────────────────────────────

describe('GET /api/shifts/agenda', () => {
  it('未認証は 401 を返す', async () => {
    const res = await app.request(
      '/api/shifts/agenda?cursor=2026-01-10&direction=future',
      {},
      envWith({}),
    );
    expect(res.status).toBe(401);
  });

  it('未来方向は起点日以降の稼働日のみを昇順で返し、休校日をスキップする', async () => {
    const ski = await seedDepartment('スキー', 'ski');
    const snb = await seedDepartment('スノーボード', 'snowboard');
    const fullDay = await seedShiftType('終日');
    const morning = await seedShiftType('午前');
    const inst1 = await seedInstructor('山田', '太郎');
    const inst2 = await seedInstructor('鈴木', '花子');
    await seedShift('2026-01-09', ski, fullDay, [inst1]); // 起点前
    await seedShift('2026-01-10', ski, fullDay, [inst1]);
    await seedShift('2026-01-12', ski, morning, [inst2]);
    await seedShift('2026-01-12', snb, fullDay, [inst1, inst2]);
    await seedShift('2026-01-15', ski, fullDay, []);
    const token = await seedToken('MEMBER');

    const res = await app.request(
      '/api/shifts/agenda?cursor=2026-01-10&direction=future&limit=2',
      authHeader(token),
      envWith({}),
    );
    expect(res.status).toBe(200);
    const body = shiftAgendaResponseSchema.parse(await res.json());

    expect(body.days.map((day) => day.date)).toEqual(['2026-01-10', '2026-01-12']);
    expect(body.days.flatMap((day) => day.date)).not.toContain('2026-01-11');
    expect(body.days[1]?.shifts).toHaveLength(2);
    expect(body.days[1]?.shifts.map((shift) => shift.department.name)).toEqual([
      'スキー',
      'スノーボード',
    ]);
    expect(body.days[1]?.shifts[1]?.assignedInstructors.map((i) => i.displayName)).toEqual([
      '山田 太郎',
      '鈴木 花子',
    ]);
    expect(body.pageInfo.nextCursor).toBe('2026-01-13');
    expect(body.pageInfo.previousCursor).toBe('2026-01-10');
  });

  it('過去方向は起点日前の稼働日を遡り、レスポンスは昇順で返す', async () => {
    const ski = await seedDepartment('スキー', 'ski');
    const fullDay = await seedShiftType('終日');
    const inst = await seedInstructor('山田', '太郎');
    await seedShift('2026-01-02', ski, fullDay, [inst]);
    await seedShift('2026-01-05', ski, fullDay, [inst]);
    await seedShift('2026-01-10', ski, fullDay, [inst]);
    await seedShift('2026-01-20', ski, fullDay, [inst]);
    const token = await seedToken('MEMBER');

    const res = await app.request(
      '/api/shifts/agenda?cursor=2026-01-20&direction=past&limit=2',
      authHeader(token),
      envWith({}),
    );
    expect(res.status).toBe(200);
    const body = shiftAgendaResponseSchema.parse(await res.json());

    expect(body.days.map((day) => day.date)).toEqual(['2026-01-05', '2026-01-10']);
    expect(body.pageInfo.nextCursor).toBe('2026-01-11');
    expect(body.pageInfo.previousCursor).toBe('2026-01-05');
  });

  it('departmentCode を指定すると対象部門の稼働日のみを返す', async () => {
    const ski = await seedDepartment('スキー', 'ski');
    const snb = await seedDepartment('スノーボード', 'snowboard');
    const fullDay = await seedShiftType('終日');
    const inst = await seedInstructor('山田', '太郎');
    await seedShift('2026-01-10', ski, fullDay, [inst]);
    await seedShift('2026-01-11', snb, fullDay, [inst]);
    await seedShift('2026-01-12', ski, fullDay, [inst]);
    const token = await seedToken('MEMBER');

    const res = await app.request(
      `/api/shifts/agenda?cursor=2026-01-10&direction=future&limit=3&departmentCode=${ski}`,
      authHeader(token),
      envWith({}),
    );
    expect(res.status).toBe(200);
    const body = shiftAgendaResponseSchema.parse(await res.json());

    expect(body.days.map((day) => day.date)).toEqual(['2026-01-10', '2026-01-12']);
    expect(body.days.flatMap((day) => day.shifts.map((shift) => shift.department.code))).toEqual([
      ski,
      ski,
    ]);
  });
});

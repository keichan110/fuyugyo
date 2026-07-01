import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { shiftViewResponseSchema } from '../src/features/shifts/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import {
  departments,
  instructors,
  shiftAssignments,
  shifts,
  shiftTypes,
  users,
} from '../src/server/db/schema';
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
  const db = createDb(env.DB);
  const [dept] = await db.insert(departments).values({ code, name, isActive: true }).returning();
  if (!dept) {
    throw new Error('seedDepartment: insert failed');
  }
  return dept.id;
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
  departmentId: string,
  shiftTypeId: string,
  instructorIds: string[] = [],
): Promise<string> {
  const db = createDb(env.DB);
  const shiftId = crypto.randomUUID();
  await db.insert(shifts).values({
    id: shiftId,
    date: new Date(`${dateStr}T00:00:00.000Z`),
    departmentId,
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
  await db.delete(departments);
  await db.delete(shiftTypes);
  await db.delete(instructors);
  await db.delete(users);
});

// ─── GET /api/shifts/weekly-view ──────────────────────────────────────────────

describe('GET /api/shifts/weekly-view', () => {
  it('開始日から7日間のシフトとサマリ（件数・部門別・割り当て総数）を返す', async () => {
    const ski = await seedDepartment('スキー', 'SKI');
    const snb = await seedDepartment('スノーボード', 'SNB');
    const st = await seedShiftType();
    const inst1 = await seedInstructor('山田', '太郎');
    const inst2 = await seedInstructor('鈴木', '花子');
    // 週内（2026-01-13〜01-19）に3件、週外に1件
    await seedShift('2026-01-13', ski, st, [inst1, inst2]);
    await seedShift('2026-01-15', ski, st, [inst1]);
    await seedShift('2026-01-19', snb, st, []);
    await seedShift('2026-01-20', ski, st, [inst1]); // 週外
    const token = await seedToken('MEMBER');

    const res = await app.request(
      '/api/shifts/weekly-view?dateFrom=2026-01-13',
      authHeader(token),
      envWith({}),
    );
    expect(res.status).toBe(200);
    const body = shiftViewResponseSchema.parse(await res.json());

    expect(body.shifts).toHaveLength(3);
    expect(body.summary.totalShifts).toBe(3);
    expect(body.summary.totalAssignments).toBe(3);
    expect(body.summary.dateRange).toEqual({
      from: '2026-01-13',
      to: '2026-01-19',
    });
    expect(body.summary.byDepartment).toEqual({ スキー: 2, スノーボード: 1 });
    // 割り当て済み Instructor が表示名付きで含まれる
    const first = body.shifts[0];
    expect(first?.assignedInstructors).toHaveLength(2);
    expect(first?.assignedInstructors.map((i) => i.displayName)).toContain('山田 太郎');
  });

  it('該当シフトが無くても期間付きの空サマリを返す', async () => {
    const token = await seedToken('MEMBER');
    const res = await app.request(
      '/api/shifts/weekly-view?dateFrom=2026-03-02',
      authHeader(token),
      envWith({}),
    );
    expect(res.status).toBe(200);
    const body = shiftViewResponseSchema.parse(await res.json());
    expect(body.shifts).toHaveLength(0);
    expect(body.summary.totalShifts).toBe(0);
    expect(body.summary.dateRange).toEqual({
      from: '2026-03-02',
      to: '2026-03-08',
    });
    expect(body.summary.byDepartment).toEqual({});
  });

  it('dateFrom が無い・不正形式は 400 を返す', async () => {
    const token = await seedToken('MEMBER');
    const missing = await app.request('/api/shifts/weekly-view', authHeader(token), envWith({}));
    expect(missing.status).toBe(400);
    const bad = await app.request(
      '/api/shifts/weekly-view?dateFrom=2026/01/13',
      authHeader(token),
      envWith({}),
    );
    expect(bad.status).toBe(400);
  });

  it('未認証は 401 を返す', async () => {
    const res = await app.request('/api/shifts/weekly-view?dateFrom=2026-01-13', {}, envWith({}));
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/shifts/monthly-view ─────────────────────────────────────────────

describe('GET /api/shifts/monthly-view', () => {
  it('指定月の全シフトとサマリを返し、前後月は含まない', async () => {
    const ski = await seedDepartment('スキー', 'SKI');
    const snb = await seedDepartment('スノーボード', 'SNB');
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
      '/api/shifts/monthly-view?month=2026-01',
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

  it('month が不正形式・範囲外は 400 を返す', async () => {
    const token = await seedToken('MEMBER');
    const bad = await app.request(
      '/api/shifts/monthly-view?month=2026-1',
      authHeader(token),
      envWith({}),
    );
    expect(bad.status).toBe(400);
    const outOfRange = await app.request(
      '/api/shifts/monthly-view?month=2026-13',
      authHeader(token),
      envWith({}),
    );
    expect(outOfRange.status).toBe(400);
  });

  it('未認証は 401 を返す', async () => {
    const res = await app.request('/api/shifts/monthly-view?month=2026-01', {}, envWith({}));
    expect(res.status).toBe(401);
  });
});

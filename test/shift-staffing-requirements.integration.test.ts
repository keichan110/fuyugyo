import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { staffingRequirementListSchema } from '../src/features/shifts/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import {
  departmentShiftTypes,
  instructors,
  shiftAssignments,
  shifts,
  shiftStaffingRequirements,
  shiftTypes,
  users,
} from '../src/server/db/schema';
import type { Env } from '../src/server/types';

/**
 * 必要人数（shift_staffing_requirements）の統合テスト（実 D1）。
 * 保存・再取得・解除、割り当てとの独立性、入力検証、認可を HTTP 境界で検証する。
 */

function envWith(): Env {
  return env as unknown as Env;
}

function jsonRequest(token: string, body: unknown): RequestInit {
  return {
    method: 'PUT',
    headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function getRequest(token: string): RequestInit {
  return { headers: { cookie: `auth-token=${token}` } };
}

async function seedToken(role: 'MANAGER' | 'MEMBER'): Promise<string> {
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

async function seedShiftType(name = '一般レッスン', skiOnly = false): Promise<string> {
  const db = createDb(env.DB);
  const [st] = await db.insert(shiftTypes).values({ name, isActive: true }).returning();
  if (!st) {
    throw new Error('seedShiftType: insert failed');
  }
  await db.insert(departmentShiftTypes).values(
    skiOnly
      ? [{ departmentCode: 'ski', shiftTypeId: st.id, sortOrder: 1 }]
      : [
          { departmentCode: 'ski', shiftTypeId: st.id, sortOrder: 1 },
          { departmentCode: 'snowboard', shiftTypeId: st.id, sortOrder: 1 },
        ],
  );
  return st.id;
}

async function seedInstructor(): Promise<string> {
  const db = createDb(env.DB);
  const [inst] = await db
    .insert(instructors)
    .values({ lastName: '山田', firstName: '太郎', status: 'ACTIVE' })
    .returning();
  if (!inst) {
    throw new Error('seedInstructor: insert failed');
  }
  return inst.id;
}

async function put(token: string, body: unknown): Promise<Response> {
  return await app.request('/api/shifts/assignments', jsonRequest(token, body), envWith());
}

async function fetchRequirements(token: string, month: string) {
  const res = await app.request(
    `/api/shifts/requirements?month=${month}`,
    getRequest(token),
    envWith(),
  );
  expect(res.status).toBe(200);
  return staffingRequirementListSchema.parse(await res.json());
}

beforeEach(async () => {
  const db = createDb(env.DB);
  await db.delete(shiftStaffingRequirements);
  await db.delete(shiftAssignments);
  await db.delete(shifts);
  await db.delete(departmentShiftTypes);
  await db.delete(shiftTypes);
  await db.delete(instructors);
  await db.delete(users);
});

describe('必要人数の保存と取得', () => {
  it('保存した必要人数を月指定で再取得できる（他月は含まれない）', async () => {
    const token = await seedToken('MANAGER');
    const shiftTypeId = await seedShiftType();
    const res = await put(token, {
      month: '2027-01',
      departmentCode: 'ski',
      cells: [],
      requirements: [
        { date: '2027-01-02', shiftTypeId, requiredCount: 3 },
        { date: '2027-01-05', shiftTypeId, requiredCount: 0 },
      ],
    });
    expect(res.status).toBe(200);
    await put(token, {
      month: '2027-02',
      departmentCode: 'snowboard',
      requirements: [{ date: '2027-02-01', shiftTypeId, requiredCount: 2 }],
    });

    expect(await fetchRequirements(token, '2027-01')).toEqual([
      { date: '2027-01-02', departmentCode: 'ski', shiftTypeId, requiredCount: 3 },
      { date: '2027-01-05', departmentCode: 'ski', shiftTypeId, requiredCount: 0 },
    ]);
  });

  it('同じ枠への再保存は更新になり、null で行が消える', async () => {
    const token = await seedToken('MANAGER');
    const shiftTypeId = await seedShiftType();
    const base = { month: '2027-01', departmentCode: 'ski', cells: [] };
    await put(token, {
      ...base,
      requirements: [{ date: '2027-01-02', shiftTypeId, requiredCount: 3 }],
    });
    await put(token, {
      ...base,
      requirements: [{ date: '2027-01-02', shiftTypeId, requiredCount: 5 }],
    });
    expect(await fetchRequirements(token, '2027-01')).toHaveLength(1);
    expect((await fetchRequirements(token, '2027-01'))[0]?.requiredCount).toBe(5);

    await put(token, {
      ...base,
      requirements: [{ date: '2027-01-02', shiftTypeId, requiredCount: null }],
    });
    expect(await fetchRequirements(token, '2027-01')).toEqual([]);
  });

  it('必要人数だけの保存は既存の割り当てに触れない', async () => {
    const token = await seedToken('MANAGER');
    const shiftTypeId = await seedShiftType();
    const instructorId = await seedInstructor();
    const month = { month: '2027-01', departmentCode: 'ski' };
    await put(token, {
      ...month,
      cells: [{ date: '2027-01-02', shiftTypeId, instructorIds: [instructorId] }],
    });
    await put(token, {
      ...month,
      cells: [],
      requirements: [{ date: '2027-01-02', shiftTypeId, requiredCount: 2 }],
    });

    const db = createDb(env.DB);
    expect(await db.select().from(shifts)).toHaveLength(1);
    expect(await db.select().from(shiftAssignments)).toHaveLength(1);
  });

  it('全員を外して Shift が消えても必要人数は残る', async () => {
    const token = await seedToken('MANAGER');
    const shiftTypeId = await seedShiftType();
    const instructorId = await seedInstructor();
    const month = { month: '2027-01', departmentCode: 'ski' };
    await put(token, {
      ...month,
      cells: [{ date: '2027-01-02', shiftTypeId, instructorIds: [instructorId] }],
      requirements: [{ date: '2027-01-02', shiftTypeId, requiredCount: 2 }],
    });
    await put(token, {
      ...month,
      cells: [{ date: '2027-01-02', shiftTypeId, instructorIds: [] }],
    });

    const db = createDb(env.DB);
    expect(await db.select().from(shifts)).toHaveLength(0);
    expect(await fetchRequirements(token, '2027-01')).toHaveLength(1);
  });

  it('必要人数の行がない既存 Shift は未設定のまま（0名や充足とみなされない）', async () => {
    const token = await seedToken('MANAGER');
    const shiftTypeId = await seedShiftType();
    const instructorId = await seedInstructor();
    await put(token, {
      month: '2027-01',
      departmentCode: 'ski',
      cells: [{ date: '2027-01-02', shiftTypeId, instructorIds: [instructorId] }],
    });
    expect(await fetchRequirements(token, '2027-01')).toEqual([]);
  });
});

describe('必要人数の入力検証と認可', () => {
  const invalidCases: [string, (shiftTypeId: string) => unknown][] = [
    ['対象月外の日付', (shiftTypeId) => ({ date: '2027-02-01', shiftTypeId, requiredCount: 1 })],
    ['実在しない日付', (shiftTypeId) => ({ date: '2027-01-32', shiftTypeId, requiredCount: 1 })],
    ['負数', (shiftTypeId) => ({ date: '2027-01-02', shiftTypeId, requiredCount: -1 })],
    ['小数', (shiftTypeId) => ({ date: '2027-01-02', shiftTypeId, requiredCount: 1.5 })],
  ];

  it.each(invalidCases)('%s は 400 で拒否し何も保存しない', async (_name, build) => {
    const token = await seedToken('MANAGER');
    const shiftTypeId = await seedShiftType();
    const res = await put(token, {
      month: '2027-01',
      departmentCode: 'ski',
      cells: [],
      requirements: [{ date: '2027-01-03', shiftTypeId, requiredCount: 1 }, build(shiftTypeId)],
    });
    expect(res.status).toBe(400);
    expect(await fetchRequirements(token, '2027-01')).toEqual([]);
  });

  it('部門で利用できないシフト種別は 400', async () => {
    const token = await seedToken('MANAGER');
    const shiftTypeId = await seedShiftType('スキー専用', true);
    const res = await put(token, {
      month: '2027-01',
      departmentCode: 'snowboard',
      requirements: [{ date: '2027-01-02', shiftTypeId, requiredCount: 1 }],
    });
    expect(res.status).toBe(400);
  });

  it('MEMBER は取得も保存も拒否される', async () => {
    const token = await seedToken('MEMBER');
    const shiftTypeId = await seedShiftType();
    const getRes = await app.request(
      '/api/shifts/requirements?month=2027-01',
      getRequest(token),
      envWith(),
    );
    expect(getRes.status).toBe(403);
    const putRes = await put(token, {
      month: '2027-01',
      departmentCode: 'ski',
      requirements: [{ date: '2027-01-02', shiftTypeId, requiredCount: 1 }],
    });
    expect(putRes.status).toBe(403);
  });

  it('month が不正なら 400', async () => {
    const token = await seedToken('MANAGER');
    const res = await app.request(
      '/api/shifts/requirements?month=2027-13',
      getRequest(token),
      envWith(),
    );
    expect(res.status).toBe(400);
  });
});

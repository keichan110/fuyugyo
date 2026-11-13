import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { staffingRequirementListSchema } from '../src/features/shifts/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import {
  departmentShiftTypes,
  instructors,
  shiftAssignments,
  shifts,
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

  it('全員を外しても必要人数のある Shift は残る', async () => {
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
    expect(await db.select().from(shifts)).toHaveLength(1);
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

describe('シフト保存・公開の上限', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T15:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it.each(['cells', 'requirements'] as const)('%s は31件まで保存できる', async (field) => {
    const token = await seedToken('MANAGER');
    const shiftTypeId = await seedShiftType();
    const items = Array.from({ length: 31 }, (_, index) => ({
      date: `2027-01-${String(index + 1).padStart(2, '0')}`,
      shiftTypeId,
      ...(field === 'cells'
        ? { instructorIds: [], description: '通常保存' }
        : { requiredCount: 1 }),
    }));
    const response = await put(token, {
      month: '2027-01',
      departmentCode: 'ski',
      cells: [],
      [field]: items,
    });
    expect(response.status).toBe(200);
    expect(await createDb(env.DB).select().from(shifts)).toHaveLength(31);
  });

  it.each(['cells', 'requirements'] as const)('%s の32件以上は保存せず400', async (field) => {
    const token = await seedToken('MANAGER');
    const shiftTypeId = await seedShiftType();
    const items = Array.from({ length: 101 }, (_, index) => ({
      date: `2027-01-${String((index % 31) + 1).padStart(2, '0')}`,
      shiftTypeId,
      instructorIds: [],
      requiredCount: 1,
    }));
    for (const count of [32, 101]) {
      const response = await put(token, {
        month: '2027-01',
        departmentCode: 'ski',
        cells: [],
        [field]: items.slice(0, count),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        message: expect.stringContaining('"too_big"'),
      });
    }
    expect(await createDb(env.DB).select().from(shifts)).toHaveLength(0);
  });

  it.each(['cells', 'requirements', 'both'])(
    '複数種別が %s にある場合は保存せず400',
    async (field) => {
      const token = await seedToken('MANAGER');
      const first = await seedShiftType('午前');
      const second = await seedShiftType('午後');
      const cells = [first, second].map((shiftTypeId) => ({
        date: '2027-01-01',
        shiftTypeId,
        description: '保存しない',
        instructorIds: [],
      }));
      const requirements = [first, second].map((shiftTypeId) => ({
        date: '2027-01-01',
        shiftTypeId,
        requiredCount: 1,
      }));
      const response = await put(token, {
        month: '2027-01',
        departmentCode: 'ski',
        cells: field === 'cells' ? cells : field === 'both' ? cells.slice(0, 1) : [],
        requirements:
          field === 'requirements' ? requirements : field === 'both' ? requirements.slice(1) : [],
      });
      expect(response.status).toBe(400);
      expect(await createDb(env.DB).select().from(shifts)).toHaveLength(0);
    },
  );

  it('同一種別の割当と必要人数を31件ずつ同時に保存できる', async () => {
    const token = await seedToken('MANAGER');
    const shiftTypeId = await seedShiftType();
    const items = Array.from({ length: 31 }, (_, index) => ({
      date: `2027-01-${String(index + 1).padStart(2, '0')}`,
      shiftTypeId,
    }));
    const response = await put(token, {
      month: '2027-01',
      departmentCode: 'ski',
      cells: items.map((item) => ({ ...item, description: '同時保存', instructorIds: [] })),
      requirements: items.map((item) => ({ ...item, requiredCount: 1 })),
    });
    expect(response.status).toBe(200);
    expect(await createDb(env.DB).select().from(shifts)).toHaveLength(31);
  });

  it.each([
    ['2025-01-01', 200],
    ['2027-11-30', 200],
    ['2027-12-01', 400],
    ['9999-12-31', 400],
  ] as const)('%s の割当・必要人数保存と公開は %i', async (date, status) => {
    const token = await seedToken('MANAGER');
    const shiftTypeId = await seedShiftType();
    const base = { month: date.slice(0, 7), departmentCode: 'ski' };
    const save = await put(token, {
      ...base,
      cells: [{ date, shiftTypeId, description: '上限確認', instructorIds: [] }],
      requirements: [{ date, shiftTypeId, requiredCount: 1 }],
    });
    expect(save.status).toBe(status);
    const rows = await createDb(env.DB).select().from(shifts);
    expect(rows).toHaveLength(status === 200 ? 1 : 0);
    for (const publicationStatus of ['PUBLISHED', 'DRAFT']) {
      const response = await app.request(
        '/api/shifts/publication',
        jsonRequest(token, {
          ...base,
          shiftTypeId,
          status: publicationStatus,
          dates: [{ date, expectedRevision: publicationStatus === 'DRAFT' ? 1 : 0 }],
        }),
        envWith(),
      );
      expect(response.status).toBe(status);
    }
  });
});

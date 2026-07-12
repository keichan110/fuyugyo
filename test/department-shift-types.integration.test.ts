import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  assignDepartmentShiftTypeSchema,
  departmentShiftTypeListSchema,
  departmentShiftTypeUpdateSchema,
} from '../src/features/department-shift-types/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import { departmentShiftTypes, shiftTypes, users } from '../src/server/db/schema';
import type { Env } from '../src/server/types';

function envWith(overrides: Partial<Env>): Env {
  return { ...(env as unknown as Env), ...overrides };
}

function authRequest(token: string, body?: unknown): RequestInit {
  return {
    headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

async function seedToken(role: 'ADMIN' | 'MANAGER' | 'MEMBER'): Promise<string> {
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
    throw new Error('ユーザーの作成に失敗しました');
  }

  return signJwt(
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

beforeEach(async () => {
  const db = createDb(env.DB);
  await db.delete(departmentShiftTypes);
  await db.delete(shiftTypes);
  await db.delete(users);
});

describe('GET /api/department-shift-types/:departmentCode', () => {
  it('部門で可用な種別を非アクティブも含め sortOrder 順に返す', async () => {
    const db = createDb(env.DB);
    const [morning, retired] = await db
      .insert(shiftTypes)
      .values([
        { name: '午前', isActive: true },
        { name: '旧種別', isActive: false },
      ])
      .returning();
    if (!morning || !retired) {
      throw new Error('シフト種別の作成に失敗しました');
    }
    await db.insert(departmentShiftTypes).values([
      { departmentCode: 'ski', shiftTypeId: morning.id, sortOrder: 2 },
      { departmentCode: 'ski', shiftTypeId: retired.id, sortOrder: 1 },
      { departmentCode: 'snowboard', shiftTypeId: morning.id, sortOrder: 1 },
    ]);

    const token = await seedToken('MEMBER');
    const res = await app.request(
      '/api/department-shift-types/ski',
      authRequest(token),
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = departmentShiftTypeListSchema.parse(await res.json());
    expect(body).toEqual([
      { shiftTypeId: retired.id, name: '旧種別', isActive: false, sortOrder: 1 },
      { shiftTypeId: morning.id, name: '午前', isActive: true, sortOrder: 2 },
    ]);
  });

  it('未知の部門コードを 400 で拒否する', async () => {
    const token = await seedToken('MEMBER');
    const res = await app.request(
      '/api/department-shift-types/unknown',
      authRequest(token),
      envWith({}),
    );
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/department-shift-types/:departmentCode', () => {
  it('順序付き配列で可用集合を並べ替える', async () => {
    const db = createDb(env.DB);
    const [first, second] = await db
      .insert(shiftTypes)
      .values([{ name: '終日' }, { name: '午前' }])
      .returning();
    if (!first || !second) {
      throw new Error('シフト種別の作成に失敗しました');
    }
    await db.insert(departmentShiftTypes).values([
      { departmentCode: 'ski', shiftTypeId: first.id, sortOrder: 1 },
      { departmentCode: 'ski', shiftTypeId: second.id, sortOrder: 2 },
    ]);

    const token = await seedToken('ADMIN');
    const input = departmentShiftTypeUpdateSchema.parse({
      shiftTypeIds: [second.id, first.id],
    });
    const res = await app.request(
      '/api/department-shift-types/ski',
      { method: 'PUT', ...authRequest(token, input) },
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = departmentShiftTypeListSchema.parse(await res.json());
    expect(body.map(({ shiftTypeId, sortOrder }) => ({ shiftTypeId, sortOrder }))).toEqual([
      { shiftTypeId: second.id, sortOrder: 1 },
      { shiftTypeId: first.id, sortOrder: 2 },
    ]);
  });

  it('MEMBER を 403 で拒否する', async () => {
    const token = await seedToken('MEMBER');
    const res = await app.request(
      '/api/department-shift-types/ski',
      { method: 'PUT', ...authRequest(token, { shiftTypeIds: [] }) },
      envWith({}),
    );
    expect(res.status).toBe(403);
  });

  it('MANAGER を 403 で拒否する', async () => {
    const token = await seedToken('MANAGER');
    const res = await app.request(
      '/api/department-shift-types/ski',
      { method: 'PUT', ...authRequest(token, { shiftTypeIds: [] }) },
      envWith({}),
    );
    expect(res.status).toBe(403);
  });

  it('重複したシフト種別 ID を 400 で拒否する', async () => {
    const token = await seedToken('ADMIN');
    const res = await app.request(
      '/api/department-shift-types/ski',
      { method: 'PUT', ...authRequest(token, { shiftTypeIds: ['same', 'same'] }) },
      envWith({}),
    );
    expect(res.status).toBe(400);
  });

  it('追加または除外を含む配列を 400 で拒否する', async () => {
    const db = createDb(env.DB);
    const [assigned, unassigned] = await db
      .insert(shiftTypes)
      .values([{ name: '終日' }, { name: '午前' }])
      .returning();
    if (!assigned || !unassigned) throw new Error('シフト種別の作成に失敗しました');
    await db.insert(departmentShiftTypes).values({
      departmentCode: 'ski',
      shiftTypeId: assigned.id,
      sortOrder: 1,
    });
    const token = await seedToken('ADMIN');

    const addRes = await app.request(
      '/api/department-shift-types/ski',
      { method: 'PUT', ...authRequest(token, { shiftTypeIds: [assigned.id, unassigned.id] }) },
      envWith({}),
    );
    const removeRes = await app.request(
      '/api/department-shift-types/ski',
      { method: 'PUT', ...authRequest(token, { shiftTypeIds: [] }) },
      envWith({}),
    );

    expect(addRes.status).toBe(400);
    expect(removeRes.status).toBe(400);
    const assignmentsRes = await app.request(
      '/api/department-shift-types/ski',
      authRequest(token),
      envWith({}),
    );
    expect(departmentShiftTypeListSchema.parse(await assignmentsRes.json())).toMatchObject([
      { shiftTypeId: assigned.id },
    ]);
  });
});

describe('POST /api/department-shift-types/:departmentCode/assignments', () => {
  it('指定した種別だけを部門の末尾へ割り当て、既存の割当を保持する', async () => {
    const db = createDb(env.DB);
    const [existing, assigned] = await db
      .insert(shiftTypes)
      .values([{ name: '終日' }, { name: '午後' }])
      .returning();
    if (!existing || !assigned) throw new Error('シフト種別の作成に失敗しました');
    await db.insert(departmentShiftTypes).values({
      departmentCode: 'ski',
      shiftTypeId: existing.id,
      sortOrder: 1,
    });

    const token = await seedToken('ADMIN');
    const input = assignDepartmentShiftTypeSchema.parse({ shiftTypeId: assigned.id });
    const res = await app.request(
      '/api/department-shift-types/ski/assignments',
      { method: 'POST', ...authRequest(token, input) },
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = departmentShiftTypeListSchema.parse(await res.json());
    expect(body.map(({ name, sortOrder }) => ({ name, sortOrder }))).toEqual([
      { name: '終日', sortOrder: 1 },
      { name: '午後', sortOrder: 2 },
    ]);
  });

  it('同じ種別の再割当を冪等に扱う', async () => {
    const db = createDb(env.DB);
    const [assigned] = await db.insert(shiftTypes).values({ name: '終日' }).returning();
    if (!assigned) throw new Error('シフト種別の作成に失敗しました');
    await db.insert(departmentShiftTypes).values({
      departmentCode: 'ski',
      shiftTypeId: assigned.id,
      sortOrder: 1,
    });

    const token = await seedToken('ADMIN');
    const res = await app.request(
      '/api/department-shift-types/ski/assignments',
      { method: 'POST', ...authRequest(token, { shiftTypeId: assigned.id }) },
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = departmentShiftTypeListSchema.parse(await res.json());
    expect(body).toHaveLength(1);
  });
});

describe('DELETE /api/department-shift-types/:departmentCode/assignments/:shiftTypeId', () => {
  it('指定した種別だけを部門から除外する', async () => {
    const db = createDb(env.DB);
    const [remaining, removed] = await db
      .insert(shiftTypes)
      .values([{ name: '終日' }, { name: '午前' }])
      .returning();
    if (!remaining || !removed) throw new Error('シフト種別の作成に失敗しました');
    await db.insert(departmentShiftTypes).values([
      { departmentCode: 'ski', shiftTypeId: remaining.id, sortOrder: 1 },
      { departmentCode: 'ski', shiftTypeId: removed.id, sortOrder: 2 },
    ]);

    const token = await seedToken('ADMIN');
    const res = await app.request(
      `/api/department-shift-types/ski/assignments/${removed.id}`,
      { method: 'DELETE', ...authRequest(token) },
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = departmentShiftTypeListSchema.parse(await res.json());
    expect(body.map((item) => item.shiftTypeId)).toEqual([remaining.id]);
  });
});

describe('POST /api/department-shift-types/:departmentCode', () => {
  it('シフト種別を作成し、選択中の部門の末尾へ割り当てる', async () => {
    const db = createDb(env.DB);
    const [existing] = await db.insert(shiftTypes).values({ name: '終日' }).returning();
    if (!existing) throw new Error('シフト種別の作成に失敗しました');
    await db.insert(departmentShiftTypes).values({
      departmentCode: 'ski',
      shiftTypeId: existing.id,
      sortOrder: 1,
    });

    const token = await seedToken('ADMIN');
    const res = await app.request(
      '/api/department-shift-types/ski',
      { method: 'POST', ...authRequest(token, { name: '午後' }) },
      envWith({}),
    );

    expect(res.status).toBe(201);
    const body = departmentShiftTypeListSchema.parse(await res.json());
    expect(body.map(({ name, sortOrder }) => ({ name, sortOrder }))).toEqual([
      { name: '終日', sortOrder: 1 },
      { name: '午後', sortOrder: 2 },
    ]);
  });

  it('MANAGER を 403 で拒否する', async () => {
    const token = await seedToken('MANAGER');
    const res = await app.request(
      '/api/department-shift-types/ski',
      { method: 'POST', ...authRequest(token, { name: '午後' }) },
      envWith({}),
    );
    expect(res.status).toBe(403);
  });
});

import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import {
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
  it('順序付き配列で可用集合の追加・除外・並べ替えを一括反映する', async () => {
    const db = createDb(env.DB);
    const [first, removed, added] = await db
      .insert(shiftTypes)
      .values([{ name: '終日' }, { name: '午前' }, { name: '午後' }])
      .returning();
    if (!first || !removed || !added) {
      throw new Error('シフト種別の作成に失敗しました');
    }
    await db.insert(departmentShiftTypes).values([
      { departmentCode: 'ski', shiftTypeId: first.id, sortOrder: 1 },
      { departmentCode: 'ski', shiftTypeId: removed.id, sortOrder: 2 },
    ]);

    const token = await seedToken('MANAGER');
    const input = departmentShiftTypeUpdateSchema.parse({
      shiftTypeIds: [added.id, first.id],
    });
    const res = await app.request(
      '/api/department-shift-types/ski',
      { method: 'PUT', ...authRequest(token, input) },
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = departmentShiftTypeListSchema.parse(await res.json());
    expect(body.map(({ shiftTypeId, sortOrder }) => ({ shiftTypeId, sortOrder }))).toEqual([
      { shiftTypeId: added.id, sortOrder: 1 },
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

  it('重複したシフト種別 ID を 400 で拒否する', async () => {
    const token = await seedToken('MANAGER');
    const res = await app.request(
      '/api/department-shift-types/ski',
      { method: 'PUT', ...authRequest(token, { shiftTypeIds: ['same', 'same'] }) },
      envWith({}),
    );
    expect(res.status).toBe(400);
  });
});

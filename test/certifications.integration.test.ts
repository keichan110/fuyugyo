import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  certificationListSchema,
  certificationSchema,
} from '../src/features/certifications/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import { certifications, users } from '../src/server/db/schema';
import type { Env } from '../src/server/types';

/**
 * Certification CRUD の統合テスト（実 D1）。
 * Hono の HTTP 境界 × 実 D1 を継ぎ目として、CRUD 操作と外部キー整合を検証する。
 */

function envWith(overrides: Partial<Env>): Env {
  return { ...(env as unknown as Env), ...overrides };
}

function authHeader(token: string): RequestInit {
  return { headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' } };
}

function authJsonRequest(token: string, body: unknown): RequestInit {
  return {
    headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** seed: MANAGER ロールの User を1件作成し、JWT を発行して返す */
async function seedManagerToken(): Promise<string> {
  const db = createDb(env.DB);
  const [user] = await db
    .insert(users)
    .values({
      lineUserId: `line-${crypto.randomUUID()}`,
      displayName: 'テストマネージャー',
      role: 'MANAGER',
      isActive: true,
    })
    .returning();
  if (!user) throw new Error('seedManagerToken: user insert failed');

  return await signJwt(
    {
      userId: user.id,
      lineUserId: user.lineUserId,
      displayName: user.displayName,
      role: 'MANAGER',
      isActive: true,
    },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN,
  );
}

/** seed: MEMBER ロールの User を1件作成し、JWT を発行して返す */
async function seedMemberToken(): Promise<string> {
  const db = createDb(env.DB);
  const [user] = await db
    .insert(users)
    .values({
      lineUserId: `line-${crypto.randomUUID()}`,
      displayName: 'テストメンバー',
      role: 'MEMBER',
      isActive: true,
    })
    .returning();
  if (!user) throw new Error('seedMemberToken: user insert failed');

  return await signJwt(
    {
      userId: user.id,
      lineUserId: user.lineUserId,
      displayName: user.displayName,
      role: 'MEMBER',
      isActive: true,
    },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN,
  );
}

/** seed: Department コードを返す */
async function seedDepartment(): Promise<string> {
  return 'ski';
}

beforeEach(async () => {
  // 各テストを独立させるためデータを全削除する（外部キー依存順に削除）
  const db = createDb(env.DB);
  await db.delete(certifications);
  await db.delete(users);
});

describe('GET /api/certifications', () => {
  it('未認証は 401 を返す', async () => {
    const res = await app.request('/api/certifications', {}, envWith({}));
    expect(res.status).toBe(401);
  });

  it('資格が0件のとき空配列を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request('/api/certifications', authHeader(token), envWith({}));

    expect(res.status).toBe(200);
    const body = certificationListSchema.parse(await res.json());
    expect(body).toHaveLength(0);
  });

  it('作成済み資格を一覧で返す', async () => {
    const db = createDb(env.DB);
    const departmentCode = await seedDepartment();
    await db.insert(certifications).values({
      departmentCode,
      name: 'スキー指導員',
      shortName: '指導員',
      organization: '全日本スキー連盟',
      isActive: true,
    });
    await db.insert(certifications).values({
      departmentCode,
      name: 'スキー準指導員',
      shortName: '準指導員',
      organization: '全日本スキー連盟',
      isActive: true,
    });

    const token = await seedManagerToken();
    const res = await app.request('/api/certifications', authHeader(token), envWith({}));

    expect(res.status).toBe(200);
    const body = certificationListSchema.parse(await res.json());
    expect(body).toHaveLength(2);
  });

  it('active=false でアクティブ・非アクティブ両方を返す', async () => {
    const db = createDb(env.DB);
    const departmentCode = await seedDepartment();
    await db.insert(certifications).values({
      departmentCode,
      name: 'スキー指導員',
      shortName: '指導員',
      organization: '全日本スキー連盟',
      isActive: true,
    });
    await db.insert(certifications).values({
      departmentCode,
      name: '廃止資格',
      shortName: '廃止',
      organization: '旧団体',
      isActive: false,
    });

    const token = await seedManagerToken();
    const res = await app.request(
      '/api/certifications?active=false',
      authHeader(token),
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = certificationListSchema.parse(await res.json());
    expect(body).toHaveLength(2);
  });

  it('departmentCode フィルターで特定部門の資格のみ返す', async () => {
    const db = createDb(env.DB);
    const deptId1 = await seedDepartment();
    const dept2 = 'snowboard';

    await db.insert(certifications).values({
      departmentCode: deptId1,
      name: 'スキー指導員',
      shortName: '指導員',
      organization: '全日本スキー連盟',
    });
    await db.insert(certifications).values({
      departmentCode: dept2,
      name: 'スノーボードインストラクター',
      shortName: 'SB-I',
      organization: 'JSF',
    });

    const token = await seedManagerToken();
    const res = await app.request(
      `/api/certifications?departmentCode=${deptId1}`,
      authHeader(token),
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = certificationListSchema.parse(await res.json());
    expect(body).toHaveLength(1);
    expect(body[0]?.departmentCode).toBe(deptId1);
  });
});

describe('GET /api/certifications/:id', () => {
  it('存在する資格を返す', async () => {
    const db = createDb(env.DB);
    const departmentCode = await seedDepartment();
    const [cert] = await db
      .insert(certifications)
      .values({
        departmentCode,
        name: 'スキー指導員',
        shortName: '指導員',
        organization: '全日本スキー連盟',
      })
      .returning();
    if (!cert) throw new Error('insert failed');

    const token = await seedManagerToken();
    const res = await app.request(`/api/certifications/${cert.id}`, authHeader(token), envWith({}));

    expect(res.status).toBe(200);
    const body = certificationSchema.parse(await res.json());
    expect(body.id).toBe(cert.id);
    expect(body.name).toBe('スキー指導員');
    expect(body.shortName).toBe('指導員');
    expect(body.departmentCode).toBe(departmentCode);
  });

  it('存在しない ID は 404 を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/certifications/nonexistent-id',
      authHeader(token),
      envWith({}),
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/certifications', () => {
  it('MEMBER は 403 で拒否される', async () => {
    const departmentCode = await seedDepartment();
    const token = await seedMemberToken();
    const res = await app.request(
      '/api/certifications',
      {
        method: 'POST',
        ...authJsonRequest(token, {
          departmentCode,
          name: 'スキー指導員',
          shortName: '指導員',
          organization: '全日本スキー連盟',
        }),
      },
      envWith({}),
    );
    expect(res.status).toBe(403);
  });

  it('MANAGER は資格を作成できる', async () => {
    const departmentCode = await seedDepartment();
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/certifications',
      {
        method: 'POST',
        ...authJsonRequest(token, {
          departmentCode,
          name: 'スキー指導員',
          shortName: '指導員',
          organization: '全日本スキー連盟',
          description: 'スキー部門の指導員資格',
        }),
      },
      envWith({}),
    );

    expect(res.status).toBe(201);
    const body = certificationSchema.parse(await res.json());
    expect(body.name).toBe('スキー指導員');
    expect(body.shortName).toBe('指導員');
    expect(body.organization).toBe('全日本スキー連盟');
    expect(body.description).toBe('スキー部門の指導員資格');
    expect(body.departmentCode).toBe(departmentCode);
    expect(body.isActive).toBe(true);
  });

  it('不正な departmentCode は 400 を返す（固定分類語彙）', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/certifications',
      {
        method: 'POST',
        ...authJsonRequest(token, {
          departmentCode: 'nonexistent-dept-id',
          name: 'スキー指導員',
          shortName: '指導員',
          organization: '全日本スキー連盟',
        }),
      },
      envWith({}),
    );
    expect(res.status).toBe(400);
  });

  it('バリデーションエラーは 400 を返す', async () => {
    const departmentCode = await seedDepartment();
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/certifications',
      {
        method: 'POST',
        ...authJsonRequest(token, {
          departmentCode,
          name: '',
          shortName: '指導員',
          organization: '全日本スキー連盟',
        }),
      },
      envWith({}),
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/certifications/:id', () => {
  it('name・shortName・organization・description を更新できる', async () => {
    const db = createDb(env.DB);
    const departmentCode = await seedDepartment();
    const [cert] = await db
      .insert(certifications)
      .values({
        departmentCode,
        name: 'スキー指導員',
        shortName: '指導員',
        organization: '全日本スキー連盟',
      })
      .returning();
    if (!cert) throw new Error('insert failed');

    const token = await seedManagerToken();
    const res = await app.request(
      `/api/certifications/${cert.id}`,
      {
        method: 'PATCH',
        ...authJsonRequest(token, {
          name: 'アルペンスキー指導員',
          shortName: 'ア指',
          organization: 'SAJ',
          description: '更新済み',
        }),
      },
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = certificationSchema.parse(await res.json());
    expect(body.name).toBe('アルペンスキー指導員');
    expect(body.shortName).toBe('ア指');
    expect(body.organization).toBe('SAJ');
    expect(body.description).toBe('更新済み');
    // departmentCode は変更されない
    expect(body.departmentCode).toBe(departmentCode);
  });

  it('存在しない ID は 404 を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/certifications/nonexistent-id',
      { method: 'PATCH', ...authJsonRequest(token, { name: '変更後' }) },
      envWith({}),
    );
    expect(res.status).toBe(404);
  });

  it('更新フィールドが1つもない空ボディは 400 を返す', async () => {
    const db = createDb(env.DB);
    const departmentCode = await seedDepartment();
    const [cert] = await db
      .insert(certifications)
      .values({
        departmentCode,
        name: 'スキー指導員',
        shortName: '指導員',
        organization: '全日本スキー連盟',
      })
      .returning();
    if (!cert) throw new Error('insert failed');

    const token = await seedManagerToken();
    const res = await app.request(
      `/api/certifications/${cert.id}`,
      { method: 'PATCH', ...authJsonRequest(token, {}) },
      envWith({}),
    );
    expect(res.status).toBe(400);
  });

  it('MEMBER は 403 で拒否される', async () => {
    const db = createDb(env.DB);
    const departmentCode = await seedDepartment();
    const [cert] = await db
      .insert(certifications)
      .values({
        departmentCode,
        name: 'スキー指導員',
        shortName: '指導員',
        organization: '全日本スキー連盟',
      })
      .returning();
    if (!cert) throw new Error('insert failed');

    const token = await seedMemberToken();
    const res = await app.request(
      `/api/certifications/${cert.id}`,
      { method: 'PATCH', ...authJsonRequest(token, { name: '変更後' }) },
      envWith({}),
    );
    expect(res.status).toBe(403);
  });
});

describe('POST /api/certifications/:id/deactivate', () => {
  it('資格を無効化できる（isActive=false）', async () => {
    const db = createDb(env.DB);
    const departmentCode = await seedDepartment();
    const [cert] = await db
      .insert(certifications)
      .values({
        departmentCode,
        name: 'スキー指導員',
        shortName: '指導員',
        organization: '全日本スキー連盟',
        isActive: true,
      })
      .returning();
    if (!cert) throw new Error('insert failed');

    const token = await seedManagerToken();
    const res = await app.request(
      `/api/certifications/${cert.id}/deactivate`,
      { method: 'POST', ...authHeader(token) },
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = certificationSchema.parse(await res.json());
    expect(body.isActive).toBe(false);

    // 無効化後は通常の一覧（アクティブのみ）に出ない
    const listRes = await app.request('/api/certifications', authHeader(token), envWith({}));
    const list = certificationListSchema.parse(await listRes.json());
    expect(list.find((c) => c.id === cert.id)).toBeUndefined();
  });

  it('存在しない ID は 404 を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/certifications/nonexistent-id/deactivate',
      { method: 'POST', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(404);
  });

  it('MEMBER は 403 で拒否される', async () => {
    const db = createDb(env.DB);
    const departmentCode = await seedDepartment();
    const [cert] = await db
      .insert(certifications)
      .values({
        departmentCode,
        name: 'スキー指導員',
        shortName: '指導員',
        organization: '全日本スキー連盟',
      })
      .returning();
    if (!cert) throw new Error('insert failed');

    const token = await seedMemberToken();
    const res = await app.request(
      `/api/certifications/${cert.id}/deactivate`,
      { method: 'POST', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(403);
  });
});

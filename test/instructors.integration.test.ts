import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  activeInstructorInDepartmentListSchema,
  instructorCertificationSchema,
  instructorListSchema,
  instructorSchema,
  instructorWithCertificationsSchema,
} from '../src/features/instructors/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import {
  certifications,
  instructorCertifications,
  instructors,
  users,
} from '../src/server/db/schema';
import type { Env } from '../src/server/types';

/**
 * Instructor CRUD・M:N・部門別抽出の統合テスト（実 D1）。
 * Hono の HTTP 境界 × 実 D1 を継ぎ目として CRUD 操作を検証する。
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

async function seedDepartment(name = 'スキー'): Promise<string> {
  return name.includes('スノ') ? 'snowboard' : 'ski';
}

async function seedCertification(departmentCode: string, name = 'スキー指導員'): Promise<string> {
  const db = createDb(env.DB);
  const [cert] = await db
    .insert(certifications)
    .values({
      departmentCode,
      name,
      shortName: '指導員',
      organization: '全日本スキー連盟',
      isActive: true,
    })
    .returning();
  if (!cert) throw new Error('seedCertification: insert failed');
  return cert.id;
}

async function seedInstructor(
  lastName = '山田',
  firstName = '太郎',
  status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
): Promise<string> {
  const db = createDb(env.DB);
  const [inst] = await db.insert(instructors).values({ lastName, firstName, status }).returning();
  if (!inst) throw new Error('seedInstructor: insert failed');
  return inst.id;
}

beforeEach(async () => {
  const db = createDb(env.DB);
  // 外部キー依存順に削除する
  await db.delete(instructorCertifications);
  await db.delete(certifications);
  await db.delete(instructors);
  await db.delete(users);
});

// ─── GET /api/instructors ─────────────────────────────────────────────────────

describe('GET /api/instructors', () => {
  it('未認証は 401 を返す', async () => {
    const res = await app.request('/api/instructors', {}, envWith({}));
    expect(res.status).toBe(401);
  });

  it('インストラクターが0件のとき空配列を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request('/api/instructors', authHeader(token), envWith({}));

    expect(res.status).toBe(200);
    const body = instructorListSchema.parse(await res.json());
    expect(body).toHaveLength(0);
  });

  it('ACTIVE インストラクターのみ返す（デフォルト）', async () => {
    await seedInstructor('山田', '太郎', 'ACTIVE');
    await seedInstructor('鈴木', '花子', 'INACTIVE');

    const token = await seedManagerToken();
    const res = await app.request('/api/instructors', authHeader(token), envWith({}));

    expect(res.status).toBe(200);
    const body = instructorListSchema.parse(await res.json());
    expect(body).toHaveLength(1);
    expect(body[0]?.lastName).toBe('山田');
  });

  it('status=INACTIVE で非アクティブのみ返す', async () => {
    await seedInstructor('山田', '太郎', 'ACTIVE');
    await seedInstructor('鈴木', '花子', 'INACTIVE');

    const token = await seedManagerToken();
    const res = await app.request(
      '/api/instructors?status=INACTIVE',
      authHeader(token),
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = instructorListSchema.parse(await res.json());
    expect(body).toHaveLength(1);
    expect(body[0]?.lastName).toBe('鈴木');
  });

  it('割り当て済みの Certification がバッジ情報として含まれる', async () => {
    const deptId = await seedDepartment();
    const certId = await seedCertification(deptId);
    const instructorId = await seedInstructor();

    const db = createDb(env.DB);
    await db.insert(instructorCertifications).values({ instructorId, certificationId: certId });

    const token = await seedManagerToken();
    const res = await app.request('/api/instructors', authHeader(token), envWith({}));

    expect(res.status).toBe(200);
    const body = instructorListSchema.parse(await res.json());
    expect(body).toHaveLength(1);
    expect(body[0]?.certifications).toHaveLength(1);
    expect(body[0]?.certifications[0]).toMatchObject({
      id: certId,
      name: 'スキー指導員',
      shortName: '指導員',
      isActive: true,
    });
  });

  it('Certification 未割り当てのインストラクターは空配列を返す', async () => {
    await seedInstructor();

    const token = await seedManagerToken();
    const res = await app.request('/api/instructors', authHeader(token), envWith({}));

    expect(res.status).toBe(200);
    const body = instructorListSchema.parse(await res.json());
    expect(body).toHaveLength(1);
    expect(body[0]?.certifications).toEqual([]);
  });

  it('無効化された Certification も isActive: false で含まれる', async () => {
    const deptId = await seedDepartment();
    const certId = await seedCertification(deptId);
    const instructorId = await seedInstructor();

    const db = createDb(env.DB);
    await db.insert(instructorCertifications).values({ instructorId, certificationId: certId });
    await db.update(certifications).set({ isActive: false }).where(eq(certifications.id, certId));

    const token = await seedManagerToken();
    const res = await app.request('/api/instructors', authHeader(token), envWith({}));

    expect(res.status).toBe(200);
    const body = instructorListSchema.parse(await res.json());
    expect(body[0]?.certifications[0]?.isActive).toBe(false);
  });
});

// ─── GET /api/instructors/:id ─────────────────────────────────────────────────

describe('GET /api/instructors/:id', () => {
  it('存在するインストラクターを Certification 一覧付きで返す', async () => {
    const deptId = await seedDepartment();
    const certId = await seedCertification(deptId);
    const instructorId = await seedInstructor();

    const db = createDb(env.DB);
    await db.insert(instructorCertifications).values({ instructorId, certificationId: certId });

    const token = await seedManagerToken();
    const res = await app.request(
      `/api/instructors/${instructorId}`,
      authHeader(token),
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = instructorWithCertificationsSchema.parse(await res.json());
    expect(body.id).toBe(instructorId);
    expect(body.lastName).toBe('山田');
    expect(body.certifications).toHaveLength(1);
    expect(body.certifications[0]?.certificationId).toBe(certId);
  });

  it('存在しない ID は 404 を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/instructors/nonexistent-id',
      authHeader(token),
      envWith({}),
    );
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/instructors ───────────────────────────────────────────────────

describe('POST /api/instructors', () => {
  it('MEMBER は 403 で拒否される', async () => {
    const token = await seedMemberToken();
    const res = await app.request(
      '/api/instructors',
      {
        method: 'POST',
        ...authJsonRequest(token, { lastName: '山田', firstName: '太郎' }),
      },
      envWith({}),
    );
    expect(res.status).toBe(403);
  });

  it('MANAGER はインストラクターを作成できる', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/instructors',
      {
        method: 'POST',
        ...authJsonRequest(token, {
          lastName: '山田',
          firstName: '太郎',
          lastNameKana: 'ヤマダ',
          firstNameKana: 'タロウ',
          notes: 'テスト備考',
        }),
      },
      envWith({}),
    );

    expect(res.status).toBe(201);
    const body = instructorSchema.parse(await res.json());
    expect(body.lastName).toBe('山田');
    expect(body.firstName).toBe('太郎');
    expect(body.lastNameKana).toBe('ヤマダ');
    expect(body.firstNameKana).toBe('タロウ');
    expect(body.notes).toBe('テスト備考');
    expect(body.status).toBe('ACTIVE');
  });

  it('バリデーションエラー（姓が空）は 400 を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/instructors',
      { method: 'POST', ...authJsonRequest(token, { lastName: '', firstName: '太郎' }) },
      envWith({}),
    );
    expect(res.status).toBe(400);
  });
});

// ─── PATCH /api/instructors/:id ──────────────────────────────────────────────

describe('PATCH /api/instructors/:id', () => {
  it('姓名・カナ・備考を更新できる', async () => {
    const instructorId = await seedInstructor();
    const token = await seedManagerToken();

    const res = await app.request(
      `/api/instructors/${instructorId}`,
      {
        method: 'PATCH',
        ...authJsonRequest(token, {
          lastName: '佐藤',
          firstName: '二郎',
          lastNameKana: 'サトウ',
          firstNameKana: 'ジロウ',
          notes: '更新済み',
        }),
      },
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = instructorSchema.parse(await res.json());
    expect(body.lastName).toBe('佐藤');
    expect(body.firstName).toBe('二郎');
    expect(body.lastNameKana).toBe('サトウ');
    expect(body.firstNameKana).toBe('ジロウ');
    expect(body.notes).toBe('更新済み');
  });

  it('存在しない ID は 404 を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/instructors/nonexistent-id',
      { method: 'PATCH', ...authJsonRequest(token, { lastName: '変更後' }) },
      envWith({}),
    );
    expect(res.status).toBe(404);
  });

  it('更新フィールドが1つもない空ボディは 400 を返す', async () => {
    const instructorId = await seedInstructor();
    const token = await seedManagerToken();
    const res = await app.request(
      `/api/instructors/${instructorId}`,
      { method: 'PATCH', ...authJsonRequest(token, {}) },
      envWith({}),
    );
    expect(res.status).toBe(400);
  });

  it('MEMBER は 403 で拒否される', async () => {
    const instructorId = await seedInstructor();
    const token = await seedMemberToken();
    const res = await app.request(
      `/api/instructors/${instructorId}`,
      { method: 'PATCH', ...authJsonRequest(token, { lastName: '変更後' }) },
      envWith({}),
    );
    expect(res.status).toBe(403);
  });
});

// ─── POST /api/instructors/:id/change-status ─────────────────────────────────

describe('POST /api/instructors/:id/change-status', () => {
  it('ACTIVE から INACTIVE に変更できる', async () => {
    const instructorId = await seedInstructor('山田', '太郎', 'ACTIVE');
    const token = await seedManagerToken();

    const res = await app.request(
      `/api/instructors/${instructorId}/change-status`,
      { method: 'POST', ...authJsonRequest(token, { status: 'INACTIVE' }) },
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = instructorSchema.parse(await res.json());
    expect(body.status).toBe('INACTIVE');
  });

  it('INACTIVE から ACTIVE に変更できる', async () => {
    const instructorId = await seedInstructor('山田', '太郎', 'INACTIVE');
    const token = await seedManagerToken();

    const res = await app.request(
      `/api/instructors/${instructorId}/change-status`,
      { method: 'POST', ...authJsonRequest(token, { status: 'ACTIVE' }) },
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = instructorSchema.parse(await res.json());
    expect(body.status).toBe('ACTIVE');
  });

  it('不正なステータス値は 400 を返す', async () => {
    const instructorId = await seedInstructor();
    const token = await seedManagerToken();

    const res = await app.request(
      `/api/instructors/${instructorId}/change-status`,
      { method: 'POST', ...authJsonRequest(token, { status: 'INVALID' }) },
      envWith({}),
    );
    expect(res.status).toBe(400);
  });

  it('存在しない ID は 404 を返す', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/instructors/nonexistent-id/change-status',
      { method: 'POST', ...authJsonRequest(token, { status: 'INACTIVE' }) },
      envWith({}),
    );
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/instructors/:id/certifications（割り当て） ──────────────────────

describe('POST /api/instructors/:id/certifications', () => {
  it('Certification を割り当てられる', async () => {
    const deptId = await seedDepartment();
    const certId = await seedCertification(deptId);
    const instructorId = await seedInstructor();
    const token = await seedManagerToken();

    const res = await app.request(
      `/api/instructors/${instructorId}/certifications`,
      { method: 'POST', ...authJsonRequest(token, { certificationId: certId }) },
      envWith({}),
    );

    expect(res.status).toBe(201);
    const body = instructorCertificationSchema.parse(await res.json());
    expect(body.instructorId).toBe(instructorId);
    expect(body.certificationId).toBe(certId);
  });

  it('同一 Certification を二重に割り当てると 409 を返す（ユニーク制約）', async () => {
    const deptId = await seedDepartment();
    const certId = await seedCertification(deptId);
    const instructorId = await seedInstructor();
    const token = await seedManagerToken();

    await app.request(
      `/api/instructors/${instructorId}/certifications`,
      { method: 'POST', ...authJsonRequest(token, { certificationId: certId }) },
      envWith({}),
    );

    const res = await app.request(
      `/api/instructors/${instructorId}/certifications`,
      { method: 'POST', ...authJsonRequest(token, { certificationId: certId }) },
      envWith({}),
    );
    expect(res.status).toBe(409);
  });

  it('存在しない Instructor への割り当ては 404 を返す', async () => {
    const deptId = await seedDepartment();
    const certId = await seedCertification(deptId);
    const token = await seedManagerToken();

    const res = await app.request(
      '/api/instructors/nonexistent-id/certifications',
      { method: 'POST', ...authJsonRequest(token, { certificationId: certId }) },
      envWith({}),
    );
    expect(res.status).toBe(404);
  });

  it('存在しない Certification への割り当ては 404 を返す', async () => {
    const instructorId = await seedInstructor();
    const token = await seedManagerToken();

    const res = await app.request(
      `/api/instructors/${instructorId}/certifications`,
      {
        method: 'POST',
        ...authJsonRequest(token, { certificationId: 'nonexistent-cert-id' }),
      },
      envWith({}),
    );
    expect(res.status).toBe(404);
  });

  it('MEMBER は 403 で拒否される', async () => {
    const deptId = await seedDepartment();
    const certId = await seedCertification(deptId);
    const instructorId = await seedInstructor();
    const token = await seedMemberToken();

    const res = await app.request(
      `/api/instructors/${instructorId}/certifications`,
      { method: 'POST', ...authJsonRequest(token, { certificationId: certId }) },
      envWith({}),
    );
    expect(res.status).toBe(403);
  });
});

// ─── DELETE /api/instructors/:id/certifications/:certId（解除） ────────────────

describe('DELETE /api/instructors/:id/certifications/:certId', () => {
  it('Certification を解除できる', async () => {
    const deptId = await seedDepartment();
    const certId = await seedCertification(deptId);
    const instructorId = await seedInstructor();
    const db = createDb(env.DB);
    await db.insert(instructorCertifications).values({ instructorId, certificationId: certId });

    const token = await seedManagerToken();
    const res = await app.request(
      `/api/instructors/${instructorId}/certifications/${certId}`,
      { method: 'DELETE', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(200);

    // 解除後は再度 GET /:id で certifications が空になる
    const detailRes = await app.request(
      `/api/instructors/${instructorId}`,
      authHeader(token),
      envWith({}),
    );
    const detail = instructorWithCertificationsSchema.parse(await detailRes.json());
    expect(detail.certifications).toHaveLength(0);
  });

  it('存在しない割り当ては 404 を返す', async () => {
    const instructorId = await seedInstructor();
    const token = await seedManagerToken();

    const res = await app.request(
      `/api/instructors/${instructorId}/certifications/nonexistent-cert-id`,
      { method: 'DELETE', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(404);
  });

  it('MEMBER は 403 で拒否される', async () => {
    const deptId = await seedDepartment();
    const certId = await seedCertification(deptId);
    const instructorId = await seedInstructor();
    const db = createDb(env.DB);
    await db.insert(instructorCertifications).values({ instructorId, certificationId: certId });

    const token = await seedMemberToken();
    const res = await app.request(
      `/api/instructors/${instructorId}/certifications/${certId}`,
      { method: 'DELETE', ...authHeader(token) },
      envWith({}),
    );
    expect(res.status).toBe(403);
  });
});

// ─── GET /api/instructors/by-department/:departmentCode/active ─────────────────

describe('GET /api/instructors/by-department/:departmentCode/active', () => {
  it('指定部門のアクティブ Instructor と Certification を返す（N+1 なし）', async () => {
    const deptId = await seedDepartment('スキー');
    const certId1 = await seedCertification(deptId, 'スキー指導員');
    const certId2 = await seedCertification(deptId, 'スキー準指導員');
    const instructorId = await seedInstructor('山田', '太郎', 'ACTIVE');
    const db = createDb(env.DB);
    await db.insert(instructorCertifications).values({ instructorId, certificationId: certId1 });
    await db.insert(instructorCertifications).values({ instructorId, certificationId: certId2 });

    const token = await seedManagerToken();
    const res = await app.request(
      `/api/instructors/by-department/${deptId}/active`,
      authHeader(token),
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = activeInstructorInDepartmentListSchema.parse(await res.json());
    expect(body).toHaveLength(1);
    expect(body[0]?.lastName).toBe('山田');
    expect(body[0]?.certifications).toHaveLength(2);
  });

  it('INACTIVE インストラクターは含まれない', async () => {
    const deptId = await seedDepartment();
    const certId = await seedCertification(deptId);
    const instructorId = await seedInstructor('山田', '太郎', 'INACTIVE');
    const db = createDb(env.DB);
    await db.insert(instructorCertifications).values({ instructorId, certificationId: certId });

    const token = await seedManagerToken();
    const res = await app.request(
      `/api/instructors/by-department/${deptId}/active`,
      authHeader(token),
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = activeInstructorInDepartmentListSchema.parse(await res.json());
    expect(body).toHaveLength(0);
  });

  it('別部門の Certification を持つインストラクターは含まれない', async () => {
    const deptId1 = await seedDepartment('スキー');
    const deptId2 = await seedDepartment('スノーボード');
    const certSki = await seedCertification(deptId1, 'スキー指導員');
    const certSb = await seedCertification(deptId2, 'SB インストラクター');
    const instSki = await seedInstructor('山田', '太郎', 'ACTIVE');
    const instSb = await seedInstructor('鈴木', '花子', 'ACTIVE');
    const db = createDb(env.DB);
    await db
      .insert(instructorCertifications)
      .values({ instructorId: instSki, certificationId: certSki });
    await db
      .insert(instructorCertifications)
      .values({ instructorId: instSb, certificationId: certSb });

    const token = await seedManagerToken();
    const res = await app.request(
      `/api/instructors/by-department/${deptId1}/active`,
      authHeader(token),
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = activeInstructorInDepartmentListSchema.parse(await res.json());
    expect(body).toHaveLength(1);
    expect(body[0]?.lastName).toBe('山田');
  });

  it('無効化された Certification を持つインストラクターは含まれない', async () => {
    const deptId = await seedDepartment();
    const db = createDb(env.DB);
    const [inactiveCert] = await db
      .insert(certifications)
      .values({
        departmentCode: deptId,
        name: '廃止資格',
        shortName: '廃止',
        organization: '旧団体',
        isActive: false,
      })
      .returning();
    if (!inactiveCert) throw new Error('insert failed');

    const instructorId = await seedInstructor();
    await db
      .insert(instructorCertifications)
      .values({ instructorId, certificationId: inactiveCert.id });

    const token = await seedManagerToken();
    const res = await app.request(
      `/api/instructors/by-department/${deptId}/active`,
      authHeader(token),
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = activeInstructorInDepartmentListSchema.parse(await res.json());
    expect(body).toHaveLength(0);
  });

  it('固定語彙にない部門コードを拒否する', async () => {
    const token = await seedManagerToken();
    const res = await app.request(
      '/api/instructors/by-department/nonexistent-dept/active',
      authHeader(token),
      envWith({}),
    );

    expect(res.status).toBe(400);
  });
});

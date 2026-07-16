import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  certificationRequirementListSchema,
  certificationRequirementUpdateSchema,
} from '../src/features/certification-requirements/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { selectInstructorIdsWithFrameCertification } from '../src/server/db/certification-requirements';
import { createDb } from '../src/server/db/client';
import {
  certificationRequirements,
  certifications,
  departmentShiftTypes,
  instructorCertifications,
  instructors,
  shiftTypes,
  users,
} from '../src/server/db/schema';
import type { Env } from '../src/server/types';

function envWith(overrides: Partial<Env>): Env {
  // cloudflare:test の env はテスト用の Binding 型であり、アプリの Env と構造的に一致しない
  return { ...(env as unknown as Env), ...overrides };
}

function authRequest(token: string, body?: unknown): RequestInit {
  return {
    headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

async function seedToken(role: 'ADMIN' | 'MEMBER'): Promise<string> {
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
  if (!user) throw new Error('ユーザーの作成に失敗しました');

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

async function seedFrame() {
  const db = createDb(env.DB);
  const [shiftType] = await db.insert(shiftTypes).values({ name: '午前' }).returning();
  if (!shiftType) throw new Error('シフト種別の作成に失敗しました');
  const [frame] = await db
    .insert(departmentShiftTypes)
    .values({ departmentCode: 'ski', shiftTypeId: shiftType.id, sortOrder: 1 })
    .returning();
  if (!frame) throw new Error('枠の作成に失敗しました');
  return { db, frame, shiftType };
}

async function seedCertification(name: string, departmentCode = 'ski') {
  const db = createDb(env.DB);
  const [certification] = await db
    .insert(certifications)
    .values({ departmentCode, name, shortName: name, organization: 'テスト連盟' })
    .returning();
  if (!certification) throw new Error('資格の作成に失敗しました');
  return certification;
}

beforeEach(async () => {
  const db = createDb(env.DB);
  await db.delete(instructorCertifications);
  await db.delete(certificationRequirements);
  await db.delete(departmentShiftTypes);
  await db.delete(certifications);
  await db.delete(instructors);
  await db.delete(shiftTypes);
  await db.delete(users);
});

describe('GET /api/certification-requirements/:departmentCode/:shiftTypeId', () => {
  it('未設定の枠を空配列として返す', async () => {
    const { shiftType } = await seedFrame();
    const token = await seedToken('ADMIN');

    const res = await app.request(
      `/api/certification-requirements/ski/${shiftType.id}`,
      authRequest(token),
      envWith({}),
    );

    expect(res.status).toBe(200);
    expect(certificationRequirementListSchema.parse(await res.json())).toEqual([]);
  });

  it('MEMBER を 403 で拒否する', async () => {
    const { shiftType } = await seedFrame();
    const token = await seedToken('MEMBER');

    const res = await app.request(
      `/api/certification-requirements/ski/${shiftType.id}`,
      authRequest(token),
      envWith({}),
    );

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/certification-requirements/:departmentCode/:shiftTypeId', () => {
  it('全置換し、相対的な段を 10/20/30 に正規化して同着を保存する', async () => {
    const { shiftType } = await seedFrame();
    const [first, second, third] = await Promise.all([
      seedCertification('指導員'),
      seedCertification('準指導員'),
      seedCertification('認定指導員'),
    ]);
    const token = await seedToken('ADMIN');
    const input = certificationRequirementUpdateSchema.parse({
      certifications: [
        { certificationId: first.id, level: 100 },
        { certificationId: second.id, level: 50 },
        { certificationId: third.id, level: 50 },
      ],
    });

    const res = await app.request(
      `/api/certification-requirements/ski/${shiftType.id}`,
      { method: 'PUT', ...authRequest(token, input) },
      envWith({}),
    );

    expect(res.status).toBe(200);
    expect(certificationRequirementListSchema.parse(await res.json())).toEqual([
      { certificationId: first.id, level: 20 },
      ...[second, third]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(({ id }) => ({ certificationId: id, level: 10 })),
    ]);

    const emptyRes = await app.request(
      `/api/certification-requirements/ski/${shiftType.id}`,
      { method: 'PUT', ...authRequest(token, { certifications: [] }) },
      envWith({}),
    );
    expect(emptyRes.status).toBe(200);
    expect(certificationRequirementListSchema.parse(await emptyRes.json())).toEqual([]);
  });

  it('別部門または未知の資格を 400 で拒否する', async () => {
    const { shiftType } = await seedFrame();
    const otherDepartmentCertification = await seedCertification('ボード指導員', 'snowboard');
    const token = await seedToken('ADMIN');

    const res = await app.request(
      `/api/certification-requirements/ski/${shiftType.id}`,
      {
        method: 'PUT',
        ...authRequest(token, {
          certifications: [
            { certificationId: otherDepartmentCertification.id, level: 1 },
            { certificationId: 'unknown', level: 2 },
          ],
        }),
      },
      envWith({}),
    );

    expect(res.status).toBe(400);
  });

  it('未認証と MEMBER を拒否する', async () => {
    const { shiftType } = await seedFrame();
    const memberToken = await seedToken('MEMBER');
    const path = `/api/certification-requirements/ski/${shiftType.id}`;

    const [unauthenticatedRes, memberRes] = await Promise.all([
      app.request(
        path,
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' },
        envWith({}),
      ),
      app.request(
        path,
        { method: 'PUT', ...authRequest(memberToken, { certifications: [] }) },
        envWith({}),
      ),
    ]);

    expect(unauthenticatedRes.status).toBe(401);
    expect(memberRes.status).toBe(403);
  });
});

describe('selectInstructorIdsWithFrameCertification', () => {
  it('ACTIVE かつ対象資格の保持者だけを重複なく返す', async () => {
    const { db, frame } = await seedFrame();
    const [target, other] = await Promise.all([
      seedCertification('指導員'),
      seedCertification('検定員'),
    ]);
    const [activeTarget, activeOther, inactiveTarget] = await db
      .insert(instructors)
      .values([
        { lastName: '有効', firstName: '対象', status: 'ACTIVE' },
        { lastName: '有効', firstName: '対象外', status: 'ACTIVE' },
        { lastName: '無効', firstName: '対象', status: 'INACTIVE' },
      ])
      .returning();
    if (!activeTarget || !activeOther || !inactiveTarget) {
      throw new Error('インストラクターの作成に失敗しました');
    }
    await db.insert(certificationRequirements).values({
      departmentShiftTypeId: frame.id,
      certificationId: target.id,
      level: 10,
    });
    await db.insert(instructorCertifications).values([
      { instructorId: activeTarget.id, certificationId: target.id },
      { instructorId: activeTarget.id, certificationId: other.id },
      { instructorId: activeOther.id, certificationId: other.id },
      { instructorId: inactiveTarget.id, certificationId: target.id },
    ]);

    await expect(selectInstructorIdsWithFrameCertification(db, frame.id)).resolves.toEqual([
      activeTarget.id,
    ]);
    await expect(
      selectInstructorIdsWithFrameCertification(db, crypto.randomUUID()),
    ).resolves.toEqual([]);
  });
});

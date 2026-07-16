import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { autoAssignContextSchema } from '../src/features/shifts/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import {
  certificationRequirements,
  certifications,
  departmentShiftTypes,
  instructorAvailabilities,
  instructorCertifications,
  instructors,
  shiftAssignments,
  shifts,
  shiftTypes,
  users,
} from '../src/server/db/schema';
import type { Env } from '../src/server/types';

function envWith(overrides: Partial<Env>): Env {
  return { ...(env as unknown as Env), ...overrides };
}

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function seedToken(role: 'MANAGER' | 'MEMBER'): Promise<string> {
  const [user] = await createDb(env.DB)
    .insert(users)
    .values({
      lineUserId: `line-${crypto.randomUUID()}`,
      displayName: role,
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
      isActive: user.isActive,
    },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN,
  );
}

function authHeader(token: string): RequestInit {
  return { headers: { cookie: `auth-token=${token}` } };
}

beforeEach(async () => {
  const db = createDb(env.DB);
  await db.delete(shiftAssignments);
  await db.delete(shifts);
  await db.delete(instructorAvailabilities);
  await db.delete(instructorCertifications);
  await db.delete(certificationRequirements);
  await db.delete(departmentShiftTypes);
  await db.delete(certifications);
  await db.delete(instructors);
  await db.delete(shiftTypes);
  await db.delete(users);
});

describe('GET /api/shifts/auto-assign-context', () => {
  it('候補・資格・優先段・可用性と月外を含む既存割当を集約する', async () => {
    const db = createDb(env.DB);
    const [shiftType] = await db.insert(shiftTypes).values({ name: '午前' }).returning();
    const [frame] = await db
      .insert(departmentShiftTypes)
      .values({ departmentCode: 'ski', shiftTypeId: shiftType!.id, sortOrder: 1 })
      .returning();
    const [certification] = await db
      .insert(certifications)
      .values({ departmentCode: 'ski', name: '指導員', shortName: '指導員', organization: '連盟' })
      .returning();
    const [candidate] = await db
      .insert(instructors)
      .values({ lastName: '候補', firstName: '太郎', status: 'ACTIVE' })
      .returning();
    const [inactive] = await db
      .insert(instructors)
      .values({ lastName: '休止', firstName: '次郎', status: 'INACTIVE' })
      .returning();
    await db.insert(certificationRequirements).values({
      departmentShiftTypeId: frame!.id,
      certificationId: certification!.id,
      level: 20,
    });
    await db.insert(instructorCertifications).values([
      { instructorId: candidate!.id, certificationId: certification!.id },
      { instructorId: inactive!.id, certificationId: certification!.id },
    ]);
    await db.insert(users).values({
      lineUserId: `line-${crypto.randomUUID()}`,
      displayName: '候補本人',
      role: 'MEMBER',
      isActive: true,
      instructorId: candidate!.id,
    });
    await db.insert(instructorAvailabilities).values({
      instructorId: candidate!.id,
      date: date('2026-01-12'),
      type: 'UNAVAILABLE',
      note: '私用',
    });
    const [inMonthShift, outsideShift] = await db
      .insert(shifts)
      .values([
        { date: date('2026-01-12'), departmentCode: 'ski', shiftTypeId: shiftType!.id },
        { date: date('2025-12-31'), departmentCode: 'snowboard', shiftTypeId: shiftType!.id },
      ])
      .returning();
    await db.insert(shiftAssignments).values([
      { shiftId: inMonthShift!.id, instructorId: candidate!.id },
      { shiftId: outsideShift!.id, instructorId: candidate!.id },
    ]);

    const token = await seedToken('MANAGER');
    const res = await app.request(
      '/api/shifts/auto-assign-context?departmentCode=ski&from=2026-01-01&to=2026-01-31',
      authHeader(token),
      envWith({}),
    );

    expect(res.status).toBe(200);
    expect(autoAssignContextSchema.parse(await res.json())).toEqual({
      departmentCode: 'ski',
      period: { from: '2026-01-01', to: '2026-01-31' },
      instructors: [
        {
          id: candidate!.id,
          displayName: '候補 太郎',
          certificationIds: [certification!.id],
          availabilityStatus: 'SUBMITTED',
        },
      ],
      frames: [
        {
          shiftTypeId: shiftType!.id,
          certificationLevels: [{ certificationId: certification!.id, level: 20 }],
          eligibleInstructorIds: [candidate!.id],
        },
      ],
      availabilities: [
        { instructorId: candidate!.id, date: '2026-01-12', type: 'UNAVAILABLE', note: '私用' },
      ],
      existingAssignments: [
        {
          date: '2025-12-31',
          departmentCode: 'snowboard',
          shiftTypeId: shiftType!.id,
          instructorIds: [candidate!.id],
        },
        {
          date: '2026-01-12',
          departmentCode: 'ski',
          shiftTypeId: shiftType!.id,
          instructorIds: [candidate!.id],
        },
      ],
    });
  });

  it('MANAGER 未満を拒否し、不正な期間を拒否する', async () => {
    const memberToken = await seedToken('MEMBER');
    const managerToken = await seedToken('MANAGER');
    const [member, invalid] = await Promise.all([
      app.request(
        '/api/shifts/auto-assign-context?departmentCode=ski&from=2026-01-01&to=2026-01-31',
        authHeader(memberToken),
        envWith({}),
      ),
      app.request(
        '/api/shifts/auto-assign-context?departmentCode=ski&from=2026-02-01&to=2026-01-31',
        authHeader(managerToken),
        envWith({}),
      ),
    ]);
    expect(member.status).toBe(403);
    expect(invalid.status).toBe(400);
  });

  it('連携済みで申告のない候補と、未連携の候補を区別する', async () => {
    const db = createDb(env.DB);
    const [certification] = await db
      .insert(certifications)
      .values({ departmentCode: 'ski', name: '指導員', shortName: '指導員', organization: '連盟' })
      .returning();
    const [linked, unlinked] = await db
      .insert(instructors)
      .values([
        { lastName: '連携', firstName: '太郎', status: 'ACTIVE' },
        { lastName: '未連携', firstName: '次郎', status: 'ACTIVE' },
      ])
      .returning();
    await db.insert(instructorCertifications).values([
      { instructorId: linked!.id, certificationId: certification!.id },
      { instructorId: unlinked!.id, certificationId: certification!.id },
    ]);
    await db.insert(users).values({
      lineUserId: `line-${crypto.randomUUID()}`,
      displayName: '連携済み本人',
      role: 'MEMBER',
      isActive: true,
      instructorId: linked!.id,
    });

    const token = await seedToken('MANAGER');
    const res = await app.request(
      '/api/shifts/auto-assign-context?departmentCode=ski&from=2026-01-01&to=2026-01-31',
      authHeader(token),
      envWith({}),
    );

    expect(res.status).toBe(200);
    const context = autoAssignContextSchema.parse(await res.json());
    expect(
      new Map(
        context.instructors.map((instructor) => [instructor.id, instructor.availabilityStatus]),
      ),
    ).toEqual(
      new Map([
        [linked!.id, 'NOT_SUBMITTED'],
        [unlinked!.id, 'NOT_LINKED'],
      ]),
    );
  });
});

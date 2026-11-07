import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { instructorWorkloadSchema } from '../src/features/shifts/schema';
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

describe('GET /api/shifts/instructor-workload', () => {
  it('シーズン内・全部門・全種別の月外勤務日を重複なく昇順で返す', async () => {
    const db = createDb(env.DB);
    const [morning, afternoon] = await db
      .insert(shiftTypes)
      .values([{ name: '午前' }, { name: '午後' }])
      .returning();
    const [target, other] = await db
      .insert(instructors)
      .values([
        { lastName: '対象', firstName: '太郎', status: 'ACTIVE' },
        { lastName: '他人', firstName: '次郎', status: 'ACTIVE' },
      ])
      .returning();
    const rows = await db
      .insert(shifts)
      .values([
        { date: date('2026-01-31'), departmentCode: 'ski', shiftTypeId: morning!.id },
        { date: date('2026-01-31'), departmentCode: 'ski', shiftTypeId: afternoon!.id },
        { date: date('2026-02-01'), departmentCode: 'snowboard', shiftTypeId: morning!.id },
        { date: date('2026-02-15'), departmentCode: 'ski', shiftTypeId: morning!.id },
        { date: date('2025-12-31'), departmentCode: 'ski', shiftTypeId: morning!.id },
        { date: date('2025-08-31'), departmentCode: 'ski', shiftTypeId: morning!.id },
        { date: date('2026-09-01'), departmentCode: 'ski', shiftTypeId: morning!.id },
        { date: date('2026-03-01'), departmentCode: 'ski', shiftTypeId: afternoon!.id },
      ])
      .returning();
    const [jan31Am, jan31Pm, feb1, feb15, dec31, outsideBefore, outsideAfter, mar1] = rows;
    await db.insert(shiftAssignments).values([
      ...[jan31Am, jan31Pm, feb1, feb15, dec31, outsideBefore, outsideAfter].map((shift) => ({
        shiftId: shift!.id,
        instructorId: target!.id,
      })),
      { shiftId: mar1!.id, instructorId: other!.id },
    ]);

    const token = await seedToken('MANAGER');
    const res = await app.request(
      `/api/shifts/instructor-workload?instructorId=${target!.id}&month=2026-02`,
      authHeader(token),
      envWith({}),
    );

    expect(res.status).toBe(200);
    expect(instructorWorkloadSchema.parse(await res.json())).toEqual({
      seasonRange: { from: '2025-09-01', to: '2026-08-31' },
      workDatesOutsideMonth: ['2025-12-31', '2026-01-31'],
    });
  });

  it('対象月のみに勤務がある場合は空配列を返す', async () => {
    const db = createDb(env.DB);
    const [shiftType] = await db.insert(shiftTypes).values({ name: '午前' }).returning();
    const [target] = await db
      .insert(instructors)
      .values({ lastName: '対象', firstName: '太郎', status: 'ACTIVE' })
      .returning();
    const [shift] = await db
      .insert(shifts)
      .values({ date: date('2026-02-10'), departmentCode: 'ski', shiftTypeId: shiftType!.id })
      .returning();
    await db.insert(shiftAssignments).values({ shiftId: shift!.id, instructorId: target!.id });

    const token = await seedToken('MANAGER');
    const res = await app.request(
      `/api/shifts/instructor-workload?instructorId=${target!.id}&month=2026-02`,
      authHeader(token),
      envWith({}),
    );
    expect(res.status).toBe(200);
    expect(instructorWorkloadSchema.parse(await res.json()).workDatesOutsideMonth).toEqual([]);
  });

  it('MANAGER 未満を拒否し、不正なクエリを拒否する', async () => {
    const memberToken = await seedToken('MEMBER');
    const managerToken = await seedToken('MANAGER');
    const [member, noInstructor, badMonth] = await Promise.all([
      app.request(
        '/api/shifts/instructor-workload?instructorId=x&month=2026-02',
        authHeader(memberToken),
        envWith({}),
      ),
      app.request(
        '/api/shifts/instructor-workload?month=2026-02',
        authHeader(managerToken),
        envWith({}),
      ),
      app.request(
        '/api/shifts/instructor-workload?instructorId=x&month=2026-13',
        authHeader(managerToken),
        envWith({}),
      ),
    ]);
    expect(member.status).toBe(403);
    expect(noInstructor.status).toBe(400);
    expect(badMonth.status).toBe(400);
  });
});

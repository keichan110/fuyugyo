import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { seasonAnalysisSchema } from '../src/features/season-analysis/schema';
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

describe('GET /api/season-analysis', () => {
  it('シーズン範囲内の事実データを返し、範囲外の枠・配置・申告を除外する', async () => {
    const db = createDb(env.DB);
    const [shiftType] = await db.insert(shiftTypes).values({ name: '午前' }).returning();
    const [cert] = await db
      .insert(certifications)
      .values({
        departmentCode: 'ski',
        name: 'スキー指導員',
        shortName: '指導員',
        organization: 'SAJ',
      })
      .returning();
    const [target, other] = await db
      .insert(instructors)
      .values([
        { lastName: '対象', firstName: '太郎', status: 'ACTIVE' },
        { lastName: '他人', firstName: '次郎', status: 'INACTIVE' },
      ])
      .returning();
    await db
      .insert(instructorCertifications)
      .values({ instructorId: target!.id, certificationId: cert!.id });
    const rows = await db
      .insert(shifts)
      .values([
        {
          date: date('2026-12-01'),
          departmentCode: 'ski',
          shiftTypeId: shiftType!.id,
          requiredCount: 2,
          status: 'PUBLISHED',
        },
        { date: date('2026-12-02'), departmentCode: 'snowboard', shiftTypeId: shiftType!.id },
        { date: date('2026-08-31'), departmentCode: 'ski', shiftTypeId: shiftType!.id },
        { date: date('2027-09-01'), departmentCode: 'ski', shiftTypeId: shiftType!.id },
      ])
      .returning();
    const [inRange, inRangeDraft, before, after] = rows;
    await db.insert(shiftAssignments).values([
      { shiftId: inRange!.id, instructorId: target!.id },
      { shiftId: inRange!.id, instructorId: other!.id },
      { shiftId: inRangeDraft!.id, instructorId: target!.id },
      { shiftId: before!.id, instructorId: target!.id },
      { shiftId: after!.id, instructorId: target!.id },
    ]);
    // 公開済み配置のある日には勤務不可を申告できない（DB トリガ）ため、配置のない日に置く
    await db.insert(instructorAvailabilities).values([
      { instructorId: target!.id, date: date('2026-12-10'), type: 'UNAVAILABLE' },
      { instructorId: target!.id, date: date('2026-12-11'), type: 'AVOID' },
      { instructorId: target!.id, date: date('2026-12-03'), type: 'AVAILABLE' },
      { instructorId: target!.id, date: date('2027-09-05'), type: 'UNAVAILABLE' },
    ]);

    const token = await seedToken('MANAGER');
    const res = await app.request(
      '/api/season-analysis?season=2026',
      authHeader(token),
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = seasonAnalysisSchema.parse(await res.json());
    expect(body.seasonRange).toEqual({ from: '2026-09-01', to: '2027-08-31' });
    expect(body.instructors).toHaveLength(2);
    expect(body.instructors.find((i) => i.id === target!.id)).toEqual({
      id: target!.id,
      displayName: '対象 太郎',
      status: 'ACTIVE',
      qualifiedDepartments: ['ski'],
    });
    expect(body.shifts.map((s) => s.date)).toEqual(['2026-12-01', '2026-12-02']);
    expect(body.shifts[0]).toMatchObject({
      departmentCode: 'ski',
      shiftTypeName: '午前',
      requiredCount: 2,
      status: 'PUBLISHED',
      assignedCount: 2,
    });
    expect(
      body.assignments.map((a) => `${a.instructorId}:${a.date}:${a.shiftStatus}`).sort(),
    ).toEqual(
      [
        `${target!.id}:2026-12-01:PUBLISHED`,
        `${other!.id}:2026-12-01:PUBLISHED`,
        `${target!.id}:2026-12-02:DRAFT`,
      ].sort(),
    );
    // AVAILABLE とシーズン範囲外は返さない
    expect(body.availabilityExceptions).toHaveLength(2);
    expect(body.availabilityExceptions.map((a) => a.type).sort()).toEqual(['AVOID', 'UNAVAILABLE']);
  });

  it('配置ごとの最上位の資格ランクと、部門×シフト種別のランク定義を返す', async () => {
    const db = createDb(env.DB);
    const [shiftType] = await db.insert(shiftTypes).values({ name: '午前' }).returning();
    const [frame] = await db
      .insert(departmentShiftTypes)
      .values({ departmentCode: 'ski', shiftTypeId: shiftType!.id, sortOrder: 1 })
      .returning();
    const [top, mid] = await db
      .insert(certifications)
      .values([
        { departmentCode: 'ski', name: '指導員', shortName: '指導員', organization: 'SAJ' },
        { departmentCode: 'ski', name: '準指導員', shortName: '準', organization: 'SAJ' },
      ])
      .returning();
    await db.insert(certificationRequirements).values([
      { departmentShiftTypeId: frame!.id, certificationId: top!.id, tierRank: 1 },
      { departmentShiftTypeId: frame!.id, certificationId: mid!.id, tierRank: 2 },
    ]);
    const [both, midOnly, none] = await db
      .insert(instructors)
      .values([
        { lastName: '両方', firstName: '一', status: 'ACTIVE' },
        { lastName: '準', firstName: '二', status: 'ACTIVE' },
        { lastName: '無', firstName: '三', status: 'ACTIVE' },
      ])
      .returning();
    await db.insert(instructorCertifications).values([
      { instructorId: both!.id, certificationId: top!.id },
      { instructorId: both!.id, certificationId: mid!.id },
      { instructorId: midOnly!.id, certificationId: mid!.id },
    ]);
    const [shift] = await db
      .insert(shifts)
      .values({ date: date('2026-12-01'), departmentCode: 'ski', shiftTypeId: shiftType!.id })
      .returning();
    await db.insert(shiftAssignments).values([
      { shiftId: shift!.id, instructorId: both!.id },
      { shiftId: shift!.id, instructorId: midOnly!.id },
      { shiftId: shift!.id, instructorId: none!.id },
    ]);

    const token = await seedToken('MANAGER');
    const res = await app.request(
      '/api/season-analysis?season=2026',
      authHeader(token),
      envWith({}),
    );
    expect(res.status).toBe(200);
    const body = seasonAnalysisSchema.parse(await res.json());
    const rankOf = (id: string) => body.assignments.find((a) => a.instructorId === id)?.tierRank;
    // 複数の要件資格を持つ人は最上位（小さい方）のランク、該当なしは null
    expect(rankOf(both!.id)).toBe(1);
    expect(rankOf(midOnly!.id)).toBe(2);
    expect(rankOf(none!.id)).toBeNull();
    expect(body.tierDefinitions).toEqual([
      {
        departmentCode: 'ski',
        shiftTypeId: shiftType!.id,
        tierRank: 1,
        certificationShortName: '指導員',
      },
      {
        departmentCode: 'ski',
        shiftTypeId: shiftType!.id,
        tierRank: 2,
        certificationShortName: '準',
      },
    ]);
  });

  it('MANAGER 未満を拒否し、不正な season を拒否する', async () => {
    const memberToken = await seedToken('MEMBER');
    const managerToken = await seedToken('MANAGER');
    const [member, missing, invalid] = await Promise.all([
      app.request('/api/season-analysis?season=2026', authHeader(memberToken), envWith({})),
      app.request('/api/season-analysis', authHeader(managerToken), envWith({})),
      app.request('/api/season-analysis?season=abc', authHeader(managerToken), envWith({})),
    ]);
    expect(member.status).toBe(403);
    expect(missing.status).toBe(400);
    expect(invalid.status).toBe(400);
  });
});

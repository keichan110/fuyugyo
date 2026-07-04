import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  assignmentSetResultSchema,
  shiftEditDataSchema,
  shiftFormDataSchema,
  shiftListSchema,
  shiftWithAssignmentsSchema,
} from '../src/features/shifts/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import {
  certifications,
  departments,
  instructorCertifications,
  instructors,
  shiftAssignments,
  shifts,
  shiftTypes,
  users,
} from '../src/server/db/schema';
import type { Env } from '../src/server/types';

/**
 * Shift + ShiftAssignment の統合テスト（実 D1）。
 * Hono の HTTP 境界 × 実 D1 を継ぎ目とし、ユニーク制約・原子性（db.batch）・
 * 割り当て・集約取得（form-data / edit-data）・認可を検証する。
 */

function envWith(overrides: Partial<Env>): Env {
  return { ...(env as unknown as Env), ...overrides };
}

function authHeader(token: string): RequestInit {
  return {
    headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' },
  };
}

function authJsonRequest(token: string, body: unknown): RequestInit {
  return {
    headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

async function seedDepartment(name = 'スキー', isActive = true): Promise<string> {
  const db = createDb(env.DB);
  const [dept] = await db
    .insert(departments)
    .values({ code: `dept-${crypto.randomUUID()}`, name, isActive })
    .returning();
  if (!dept) {
    throw new Error('seedDepartment: insert failed');
  }
  return dept.id;
}

async function seedShiftType(name = '終日', isActive = true): Promise<string> {
  const db = createDb(env.DB);
  const [st] = await db.insert(shiftTypes).values({ name, isActive }).returning();
  if (!st) {
    throw new Error('seedShiftType: insert failed');
  }
  return st.id;
}

async function seedCertification(departmentId: string, name = 'スキー指導員'): Promise<string> {
  const db = createDb(env.DB);
  const [cert] = await db
    .insert(certifications)
    .values({
      departmentId,
      name,
      shortName: '指導員',
      organization: '全日本スキー連盟',
      isActive: true,
    })
    .returning();
  if (!cert) {
    throw new Error('seedCertification: insert failed');
  }
  return cert.id;
}

async function seedInstructor(
  lastName = '山田',
  firstName = '太郎',
  status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
): Promise<string> {
  const db = createDb(env.DB);
  const [inst] = await db.insert(instructors).values({ lastName, firstName, status }).returning();
  if (!inst) {
    throw new Error('seedInstructor: insert failed');
  }
  return inst.id;
}

/** Instructor に Certification を割り当てる（edit-data の候補に載せるため） */
async function linkCertification(instructorId: string, certificationId: string): Promise<void> {
  const db = createDb(env.DB);
  await db.insert(instructorCertifications).values({ instructorId, certificationId });
}

/** 全 shift_assignments の件数を数える（原子性検証用） */
async function countAssignments(): Promise<number> {
  const db = createDb(env.DB);
  const rows = await db.select().from(shiftAssignments);
  return rows.length;
}

/** upsert API で Shift を用意し、生成された Shift ID を返す */
async function upsertShift(
  token: string,
  date: string,
  departmentId: string,
  shiftTypeId: string,
  instructorIds: string[] = [],
): Promise<string> {
  const res = await app.request(
    '/api/shifts/assignment-set',
    {
      method: 'PUT',
      ...authJsonRequest(token, {
        date,
        departmentId,
        shiftTypeId,
        instructorIds,
      }),
    },
    envWith({}),
  );
  const body = assignmentSetResultSchema.parse(await res.json());
  if (!body.shift) {
    throw new Error('upsertShift: shift was not created');
  }
  return body.shift.id;
}

beforeEach(async () => {
  const db = createDb(env.DB);
  // 外部キー依存順に削除する
  await db.delete(shiftAssignments);
  await db.delete(shifts);
  await db.delete(instructorCertifications);
  await db.delete(certifications);
  await db.delete(departments);
  await db.delete(shiftTypes);
  await db.delete(instructors);
  await db.delete(users);
});

// ─── PUT /api/shifts/assignment-set ───────────────────────────────────────────

describe('PUT /api/shifts/assignment-set', () => {
  it('空枠への最初の割り当てで Shift を生成し、備考も保存する', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const inst = await seedInstructor('山田', '太郎');
    const token = await seedToken('MANAGER');

    const res = await app.request(
      '/api/shifts/assignment-set',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          date: '2026-01-15',
          departmentId: deptId,
          shiftTypeId: stId,
          description: '縮小営業',
          instructorIds: [inst],
        }),
      },
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = assignmentSetResultSchema.parse(await res.json());
    expect(body.status).toBe('upserted');
    expect(body.shift?.description).toBe('縮小営業');
    expect(body.shift?.assignedInstructorIds).toEqual([inst]);

    const list = await app.request('/api/shifts', authHeader(token), envWith({}));
    const shiftsBody = shiftListSchema.parse(await list.json());
    expect(shiftsBody).toHaveLength(1);
    expect(shiftsBody[0]?.assignedInstructorIds).toEqual([inst]);
  });

  it('全員を外すと Shift を削除し、備考も残さない', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const inst = await seedInstructor('山田', '太郎');
    const token = await seedToken('MANAGER');

    await app.request(
      '/api/shifts/assignment-set',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          date: '2026-01-15',
          departmentId: deptId,
          shiftTypeId: stId,
          description: '消える備考',
          instructorIds: [inst],
        }),
      },
      envWith({}),
    );

    const res = await app.request(
      '/api/shifts/assignment-set',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          date: '2026-01-15',
          departmentId: deptId,
          shiftTypeId: stId,
          description: '備考だけでは残さない',
          instructorIds: [],
        }),
      },
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = assignmentSetResultSchema.parse(await res.json());
    expect(body.status).toBe('deleted');
    expect(body.shift).toBeNull();
    expect(await countAssignments()).toBe(0);

    const list = await app.request('/api/shifts', authHeader(token), envWith({}));
    const shiftsBody = shiftListSchema.parse(await list.json());
    expect(shiftsBody).toHaveLength(0);
  });

  it('存在しない Instructor を含む場合は何も作らず 400 を返す', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const token = await seedToken('MANAGER');

    const res = await app.request(
      '/api/shifts/assignment-set',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          date: '2026-01-15',
          departmentId: deptId,
          shiftTypeId: stId,
          instructorIds: ['missing'],
        }),
      },
      envWith({}),
    );

    expect(res.status).toBe(400);
    const list = await app.request('/api/shifts', authHeader(token), envWith({}));
    const shiftsBody = shiftListSchema.parse(await list.json());
    expect(shiftsBody).toHaveLength(0);
  });

  it('MEMBER は 403 で拒否される', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const token = await seedToken('MEMBER');

    const res = await app.request(
      '/api/shifts/assignment-set',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          date: '2026-01-15',
          departmentId: deptId,
          shiftTypeId: stId,
          instructorIds: [],
        }),
      },
      envWith({}),
    );

    expect(res.status).toBe(403);
  });
});

// ─── GET /api/shifts ──────────────────────────────────────────────────────────

describe('GET /api/shifts', () => {
  it('一覧を割り当て済み Instructor ID 付きで返す', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const inst = await seedInstructor();
    const token = await seedToken('MANAGER');
    await upsertShift(token, '2026-01-15', deptId, stId, [inst]);

    const res = await app.request('/api/shifts', authHeader(token), envWith({}));
    expect(res.status).toBe(200);
    const body = shiftListSchema.parse(await res.json());
    expect(body).toHaveLength(1);
    expect(body[0]?.assignedInstructorIds).toEqual([inst]);
  });

  it('dateFrom / dateTo で期間を絞り込める', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const token = await seedToken('MANAGER');
    const inst = await seedInstructor();
    await upsertShift(token, '2026-01-10', deptId, stId, [inst]);
    await upsertShift(token, '2026-01-20', deptId, stId, [inst]);
    await upsertShift(token, '2026-02-01', deptId, stId, [inst]);

    const res = await app.request(
      '/api/shifts?dateFrom=2026-01-15&dateTo=2026-01-31',
      authHeader(token),
      envWith({}),
    );
    expect(res.status).toBe(200);
    const body = shiftListSchema.parse(await res.json());
    expect(body).toHaveLength(1);
  });

  it('部門名・シフト種別名を JOIN で同梱する', async () => {
    const deptId = await seedDepartment('スキー');
    const stId = await seedShiftType('終日');
    const token = await seedToken('MANAGER');
    const inst = await seedInstructor();
    await upsertShift(token, '2026-01-15', deptId, stId, [inst]);

    const res = await app.request('/api/shifts', authHeader(token), envWith({}));
    expect(res.status).toBe(200);
    const body = shiftListSchema.parse(await res.json());
    expect(body[0]?.departmentName).toBe('スキー');
    expect(body[0]?.shiftTypeName).toBe('終日');
  });

  it('instructorId で絞り込むと、その Instructor が割り当てられたシフトのみ返す', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const inst1 = await seedInstructor('山田', '太郎');
    const inst2 = await seedInstructor('鈴木', '花子');
    const token = await seedToken('MANAGER');
    const shift1Id = await upsertShift(token, '2026-01-10', deptId, stId, [inst1]);
    await upsertShift(token, '2026-01-20', deptId, stId, [inst2]);

    const res = await app.request(
      `/api/shifts?instructorId=${inst1}`,
      authHeader(token),
      envWith({}),
    );
    expect(res.status).toBe(200);
    const body = shiftListSchema.parse(await res.json());
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe(shift1Id);
  });

  it('割り当てのない instructorId を指定すると空配列を返す', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const inst = await seedInstructor();
    const token = await seedToken('MANAGER');
    const assignedInst = await seedInstructor('佐藤', '次郎');
    await upsertShift(token, '2026-01-10', deptId, stId, [assignedInst]);

    const res = await app.request(
      `/api/shifts?instructorId=${inst}`,
      authHeader(token),
      envWith({}),
    );
    expect(res.status).toBe(200);
    const body = shiftListSchema.parse(await res.json());
    expect(body).toHaveLength(0);
  });

  it('未認証は 401 を返す', async () => {
    const res = await app.request('/api/shifts', {}, envWith({}));
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/shifts/:id ──────────────────────────────────────────────────────

describe('GET /api/shifts/:id', () => {
  it('存在するシフトを割り当て付きで返す', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const inst = await seedInstructor();
    const token = await seedToken('MANAGER');

    const shiftId = await upsertShift(token, '2026-01-15', deptId, stId, [inst]);

    const res = await app.request(`/api/shifts/${shiftId}`, authHeader(token), envWith({}));
    expect(res.status).toBe(200);
    const body = shiftWithAssignmentsSchema.parse(await res.json());
    expect(body.id).toBe(shiftId);
    expect(body.assignedInstructorIds).toEqual([inst]);
  });

  it('存在しない ID は 404 を返す', async () => {
    const token = await seedToken('MANAGER');
    const res = await app.request('/api/shifts/nonexistent', authHeader(token), envWith({}));
    expect(res.status).toBe(404);
  });
});

// ─── GET /api/shifts/form-data ────────────────────────────────────────────────

describe('GET /api/shifts/form-data', () => {
  it('アクティブな部門・シフト種別と統計を返す', async () => {
    await seedDepartment('スキー', true);
    await seedDepartment('廃止部門', false);
    await seedShiftType('終日', true);
    await seedShiftType('旧種別', false);
    await seedInstructor('山田', '太郎', 'ACTIVE');
    await seedInstructor('鈴木', '花子', 'INACTIVE');
    const token = await seedToken('MEMBER');

    const res = await app.request('/api/shifts/form-data', authHeader(token), envWith({}));
    expect(res.status).toBe(200);
    const body = shiftFormDataSchema.parse(await res.json());
    expect(body.departments).toHaveLength(1);
    expect(body.departments[0]?.name).toBe('スキー');
    expect(body.shiftTypes).toHaveLength(1);
    expect(body.shiftTypes[0]?.name).toBe('終日');
    expect(body.stats.activeInstructorsCount).toBe(1);
    expect(body.stats.totalDepartments).toBe(1);
    expect(body.stats.totalShiftTypes).toBe(1);
  });

  it('未認証は 401 を返す', async () => {
    const res = await app.request('/api/shifts/form-data', {}, envWith({}));
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/shifts/edit-data ────────────────────────────────────────────────

describe('GET /api/shifts/edit-data', () => {
  it('既存シフトがなければ create モードで候補を返す', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const certId = await seedCertification(deptId);
    const inst = await seedInstructor('山田', '太郎');
    await linkCertification(inst, certId);
    const token = await seedToken('MANAGER');

    const res = await app.request(
      `/api/shifts/edit-data?date=2026-01-15&departmentId=${deptId}&shiftTypeId=${stId}`,
      authHeader(token),
      envWith({}),
    );
    expect(res.status).toBe(200);
    const body = shiftEditDataSchema.parse(await res.json());
    expect(body.mode).toBe('create');
    expect(body.shift).toBeNull();
    expect(body.availableInstructors).toHaveLength(1);
    expect(body.availableInstructors[0]?.id).toBe(inst);
    expect(body.availableInstructors[0]?.isAssigned).toBe(false);
    expect(body.availableInstructors[0]?.certificationSummary).toBe('指導員');
  });

  it('既存シフトがあれば edit モードで割り当て状態を返す', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const certId = await seedCertification(deptId);
    const inst = await seedInstructor('山田', '太郎');
    await linkCertification(inst, certId);
    const token = await seedToken('MANAGER');

    await upsertShift(token, '2026-01-15', deptId, stId, [inst]);

    const res = await app.request(
      `/api/shifts/edit-data?date=2026-01-15&departmentId=${deptId}&shiftTypeId=${stId}`,
      authHeader(token),
      envWith({}),
    );
    expect(res.status).toBe(200);
    const body = shiftEditDataSchema.parse(await res.json());
    expect(body.mode).toBe('edit');
    expect(body.shift?.assignedInstructorIds).toEqual([inst]);
    expect(body.availableInstructors[0]?.isAssigned).toBe(true);
  });

  it('別部門の資格しか持たないインストラクターは候補に含まれない', async () => {
    const deptSki = await seedDepartment('スキー');
    const deptSb = await seedDepartment('スノーボード');
    const stId = await seedShiftType();
    const certSb = await seedCertification(deptSb, 'SB インストラクター');
    const inst = await seedInstructor('鈴木', '花子');
    await linkCertification(inst, certSb);
    const token = await seedToken('MANAGER');

    const res = await app.request(
      `/api/shifts/edit-data?date=2026-01-15&departmentId=${deptSki}&shiftTypeId=${stId}`,
      authHeader(token),
      envWith({}),
    );
    const body = shiftEditDataSchema.parse(await res.json());
    expect(body.availableInstructors).toHaveLength(0);
  });

  it('同日の別シフトに割り当て済みなら競合として返す', async () => {
    const deptId = await seedDepartment();
    const stMorning = await seedShiftType('午前');
    const stAfternoon = await seedShiftType('午後');
    const certId = await seedCertification(deptId);
    const inst = await seedInstructor('山田', '太郎');
    await linkCertification(inst, certId);
    const token = await seedToken('MANAGER');

    // 午前シフトに割り当てておく
    await upsertShift(token, '2026-01-15', deptId, stMorning, [inst]);

    // 午後シフトの編集データでは午前が競合として現れる
    const res = await app.request(
      `/api/shifts/edit-data?date=2026-01-15&departmentId=${deptId}&shiftTypeId=${stAfternoon}`,
      authHeader(token),
      envWith({}),
    );
    const body = shiftEditDataSchema.parse(await res.json());
    expect(body.availableInstructors[0]?.hasConflict).toBe(true);
    expect(body.conflicts).toHaveLength(1);
    expect(body.conflicts[0]?.instructorId).toBe(inst);
    expect(body.conflicts[0]?.conflictingShift.shiftTypeName).toBe('午前');
  });

  it('候補ペイロードに勤務負荷指標を返す', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const certId = await seedCertification(deptId);
    const inst = await seedInstructor('山田', '太郎');
    await linkCertification(inst, certId);
    const token = await seedToken('MANAGER');

    await upsertShift(token, '2025-12-20', deptId, stId, [inst]);
    await upsertShift(token, '2026-01-10', deptId, stId, [inst]);
    await upsertShift(token, '2026-01-11', deptId, stId, [inst]);
    await upsertShift(token, '2026-01-14', deptId, stId, [inst]);

    const res = await app.request(
      `/api/shifts/edit-data?date=2026-01-15&departmentId=${deptId}&shiftTypeId=${stId}`,
      authHeader(token),
      envWith({}),
    );
    const body = shiftEditDataSchema.parse(await res.json());

    expect(body.availableInstructors[0]?.workload).toEqual({
      monthlyWorkDays: 4,
      seasonWorkDays: 5,
      consecutiveWeekends: 1,
      consecutiveWorkDays: 2,
      hasWarning: false,
    });
  });

  it('パラメータ不足は 400 を返す', async () => {
    const token = await seedToken('MANAGER');
    const res = await app.request(
      '/api/shifts/edit-data?date=2026-01-15',
      authHeader(token),
      envWith({}),
    );
    expect(res.status).toBe(400);
  });

  it('MEMBER は 403 で拒否される', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const token = await seedToken('MEMBER');
    const res = await app.request(
      `/api/shifts/edit-data?date=2026-01-15&departmentId=${deptId}&shiftTypeId=${stId}`,
      authHeader(token),
      envWith({}),
    );
    expect(res.status).toBe(403);
  });
});

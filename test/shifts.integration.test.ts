import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  shiftEditDataSchema,
  shiftFormDataSchema,
  shiftListSchema,
  upsertMonthlyAssignmentsResultSchema,
} from '../src/features/shifts/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import {
  certifications,
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
 * 割り当て・集約取得（creation-context / assignment-editor）・認可を検証する。
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

async function seedDepartment(name = 'スキー', _isActive = true, code?: string): Promise<string> {
  void _isActive;
  if (code === 'ski' || code === 'snowboard') return code;
  return name.includes('スノ') || name.includes('廃止') ? 'snowboard' : 'ski';
}

async function seedShiftType(name = '終日', isActive = true): Promise<string> {
  const db = createDb(env.DB);
  const [st] = await db.insert(shiftTypes).values({ name, isActive }).returning();
  if (!st) {
    throw new Error('seedShiftType: insert failed');
  }
  return st.id;
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

/** Instructor に Certification を割り当てる（assignment-editor の候補に載せるため） */
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

/**
 * assignments API で単一セル分の Shift を用意し、生成された Shift ID を返す。
 * 単一セル専用の upsert エンドポイントは廃止済みのため、月次一括 API を1セルで呼び出す。
 */
async function upsertShift(
  token: string,
  date: string,
  departmentCode: string,
  shiftTypeId: string,
  instructorIds: string[] = [],
): Promise<string> {
  const month = date.slice(0, 7);
  const res = await app.request(
    '/api/shifts/assignments',
    {
      method: 'PUT',
      ...authJsonRequest(token, {
        month,
        departmentCode,
        cells: [{ date, shiftTypeId, instructorIds }],
      }),
    },
    envWith({}),
  );
  if (res.status !== 200) {
    throw new Error(`upsertShift: assignments failed with status ${res.status}`);
  }

  const list = await app.request('/api/shifts', authHeader(token), envWith({}));
  const shiftsBody = shiftListSchema.parse(await list.json());
  const created = shiftsBody.find(
    (s) =>
      s.date.toISOString().startsWith(date) &&
      s.departmentCode === departmentCode &&
      s.shiftTypeId === shiftTypeId,
  );
  if (!created) {
    throw new Error('upsertShift: shift was not created');
  }
  return created.id;
}

beforeEach(async () => {
  const db = createDb(env.DB);
  // 外部キー依存順に削除する
  await db.delete(shiftAssignments);
  await db.delete(shifts);
  await db.delete(instructorCertifications);
  await db.delete(certifications);
  await db.delete(shiftTypes);
  await db.delete(instructors);
  await db.delete(users);
});

// ─── PUT /api/shifts/assignments ─────────────────────────────────────

describe('PUT /api/shifts/assignments', () => {
  it('複数セルをまとめて作成し、それぞれ割り当てと備考が保存される', async () => {
    const deptId = await seedDepartment();
    const stMorning = await seedShiftType('午前');
    const stAfternoon = await seedShiftType('午後');
    const inst1 = await seedInstructor('山田', '太郎');
    const inst2 = await seedInstructor('鈴木', '花子');
    const token = await seedToken('MANAGER');

    const res = await app.request(
      '/api/shifts/assignments',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          month: '2026-02',
          departmentCode: deptId,
          cells: [
            {
              date: '2026-02-01',
              shiftTypeId: stMorning,
              description: '初日',
              instructorIds: [inst1],
            },
            {
              date: '2026-02-15',
              shiftTypeId: stAfternoon,
              instructorIds: [inst1, inst2],
            },
          ],
        }),
      },
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = upsertMonthlyAssignmentsResultSchema.parse(await res.json());
    expect(body.upsertedCount).toBe(2);
    expect(body.deletedCount).toBe(0);

    const list = await app.request('/api/shifts', authHeader(token), envWith({}));
    const shiftsBody = shiftListSchema.parse(await list.json());
    expect(shiftsBody).toHaveLength(2);
    const first = shiftsBody.find((s) => s.shiftTypeId === stMorning);
    expect(first?.description).toBe('初日');
    expect(first?.assignedInstructorIds).toEqual([inst1]);
    const second = shiftsBody.find((s) => s.shiftTypeId === stAfternoon);
    expect(second?.assignedInstructorIds.sort()).toEqual([inst1, inst2].sort());
  });

  it('既存 Shift のセルは割り当てと備考が入れ替わり、含まれないセルは変更されない', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const inst1 = await seedInstructor('山田', '太郎');
    const inst2 = await seedInstructor('鈴木', '花子');
    const inst3 = await seedInstructor('佐藤', '三郎');
    const token = await seedToken('MANAGER');

    // 事前に2セル分の既存 Shift を用意する
    await upsertShift(token, '2026-02-01', deptId, stId, [inst1]);
    await upsertShift(token, '2026-02-10', deptId, stId, [inst2]);

    const res = await app.request(
      '/api/shifts/assignments',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          month: '2026-02',
          departmentCode: deptId,
          cells: [
            {
              date: '2026-02-01',
              shiftTypeId: stId,
              description: '入替',
              instructorIds: [inst2, inst3],
            },
          ],
        }),
      },
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = upsertMonthlyAssignmentsResultSchema.parse(await res.json());
    expect(body.upsertedCount).toBe(1);
    expect(body.deletedCount).toBe(0);

    const list = await app.request('/api/shifts', authHeader(token), envWith({}));
    const shiftsBody = shiftListSchema.parse(await list.json());
    const targeted = shiftsBody.find((s) => s.date.toISOString().startsWith('2026-02-01'));
    expect(targeted?.description).toBe('入替');
    expect(targeted?.assignedInstructorIds.sort()).toEqual([inst2, inst3].sort());
    const untouched = shiftsBody.find((s) => s.date.toISOString().startsWith('2026-02-10'));
    expect(untouched?.assignedInstructorIds).toEqual([inst2]);
  });

  it('instructorIds が空のセルは既存 Shift を削除する', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const inst = await seedInstructor();
    const token = await seedToken('MANAGER');
    await upsertShift(token, '2026-02-05', deptId, stId, [inst]);

    const res = await app.request(
      '/api/shifts/assignments',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          month: '2026-02',
          departmentCode: deptId,
          cells: [
            {
              date: '2026-02-05',
              shiftTypeId: stId,
              instructorIds: [],
            },
          ],
        }),
      },
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = upsertMonthlyAssignmentsResultSchema.parse(await res.json());
    expect(body.upsertedCount).toBe(0);
    expect(body.deletedCount).toBe(1);
    expect(await countAssignments()).toBe(0);

    const list = await app.request('/api/shifts', authHeader(token), envWith({}));
    const shiftsBody = shiftListSchema.parse(await list.json());
    expect(shiftsBody).toHaveLength(0);
  });

  it('cells が空でも 200 で 0 件返す', async () => {
    const deptId = await seedDepartment();
    const token = await seedToken('MANAGER');

    const res = await app.request(
      '/api/shifts/assignments',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          month: '2026-02',
          departmentCode: deptId,
          cells: [],
        }),
      },
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = upsertMonthlyAssignmentsResultSchema.parse(await res.json());
    expect(body).toEqual({ upsertedCount: 0, deletedCount: 0 });
  });

  it('実在しない日付 (2026-02-31) は 400 で正規化による月外作成を防ぐ', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const inst = await seedInstructor();
    const token = await seedToken('MANAGER');

    const res = await app.request(
      '/api/shifts/assignments',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          month: '2026-02',
          departmentCode: deptId,
          cells: [
            {
              // 2026-02-31 は不在。dateStringSchema の形式は通るが暦上存在しない
              date: '2026-02-31',
              shiftTypeId: stId,
              instructorIds: [inst],
            },
          ],
        }),
      },
      envWith({}),
    );

    expect(res.status).toBe(400);
    const list = await app.request('/api/shifts', authHeader(token), envWith({}));
    const shiftsBody = shiftListSchema.parse(await list.json());
    expect(shiftsBody).toHaveLength(0);
  });

  it('対象月レンジ外の日付を含むと 400 で何も作らない', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const inst = await seedInstructor();
    const token = await seedToken('MANAGER');

    const res = await app.request(
      '/api/shifts/assignments',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          month: '2026-02',
          departmentCode: deptId,
          cells: [
            {
              // 2026-03-01 は対象月 2026-02 の範囲外
              date: '2026-03-01',
              shiftTypeId: stId,
              instructorIds: [inst],
            },
          ],
        }),
      },
      envWith({}),
    );

    expect(res.status).toBe(400);
    const list = await app.request('/api/shifts', authHeader(token), envWith({}));
    const shiftsBody = shiftListSchema.parse(await list.json());
    expect(shiftsBody).toHaveLength(0);
  });

  it('存在しない Instructor を含むと 400 で何も作らない', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const inst = await seedInstructor();
    const token = await seedToken('MANAGER');

    const res = await app.request(
      '/api/shifts/assignments',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          month: '2026-02',
          departmentCode: deptId,
          cells: [
            {
              date: '2026-02-01',
              shiftTypeId: stId,
              instructorIds: [inst, 'missing-instructor-id'],
            },
          ],
        }),
      },
      envWith({}),
    );

    expect(res.status).toBe(400);
    const list = await app.request('/api/shifts', authHeader(token), envWith({}));
    const shiftsBody = shiftListSchema.parse(await list.json());
    expect(shiftsBody).toHaveLength(0);
  });

  it('別部門の既存 Shift には影響しない', async () => {
    const deptA = await seedDepartment('スキー');
    const deptB = await seedDepartment('スノボ');
    const stId = await seedShiftType();
    const inst = await seedInstructor();
    const token = await seedToken('MANAGER');

    // 別部門で同日に Shift を用意しておく
    await upsertShift(token, '2026-02-01', deptB, stId, [inst]);

    const res = await app.request(
      '/api/shifts/assignments',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          month: '2026-02',
          departmentCode: deptA,
          cells: [
            {
              date: '2026-02-01',
              shiftTypeId: stId,
              instructorIds: [],
            },
          ],
        }),
      },
      envWith({}),
    );

    expect(res.status).toBe(200);
    const body = upsertMonthlyAssignmentsResultSchema.parse(await res.json());
    // 対象部門には存在しないため deletedCount は 0
    expect(body.deletedCount).toBe(0);

    const list = await app.request('/api/shifts', authHeader(token), envWith({}));
    const shiftsBody = shiftListSchema.parse(await list.json());
    // 別部門のシフトは残っている
    expect(shiftsBody).toHaveLength(1);
    expect(shiftsBody[0]?.departmentCode).toBe(deptB);
  });

  it('複数セルの途中で UNIQUE 違反が起きた場合、全体をロールバックする', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const inst = await seedInstructor();
    const token = await seedToken('MANAGER');

    // 同一キー (date × 部門 × シフト種別) を2セル分含めて UNIQUE 違反を誘発する。
    // 先頭の 2026-02-05 が成功しても、後段の失敗で batch 全体がロールバックすることを検証する。
    const res = await app.request(
      '/api/shifts/assignments',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          month: '2026-02',
          departmentCode: deptId,
          cells: [
            { date: '2026-02-05', shiftTypeId: stId, instructorIds: [inst] },
            { date: '2026-02-10', shiftTypeId: stId, instructorIds: [inst] },
            { date: '2026-02-10', shiftTypeId: stId, instructorIds: [inst] },
          ],
        }),
      },
      envWith({}),
    );

    expect(res.status).toBe(409);

    // 部分コミットが残っていないことを確認する
    const list = await app.request('/api/shifts', authHeader(token), envWith({}));
    const shiftsBody = shiftListSchema.parse(await list.json());
    expect(shiftsBody).toHaveLength(0);
    expect(await countAssignments()).toBe(0);
  });

  it('MEMBER は 403 で拒否される', async () => {
    const deptId = await seedDepartment();
    const token = await seedToken('MEMBER');

    const res = await app.request(
      '/api/shifts/assignments',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          month: '2026-02',
          departmentCode: deptId,
          cells: [],
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

  it('limit で返却件数を絞り込める（date 昇順の先頭のみ・割り当ても対応するシフトの分だけ返る）', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const token = await seedToken('MANAGER');
    const inst1 = await seedInstructor('山田', '太郎');
    const inst2 = await seedInstructor('鈴木', '花子');
    const inst3 = await seedInstructor('佐藤', '三郎');
    await upsertShift(token, '2026-01-10', deptId, stId, [inst1]);
    await upsertShift(token, '2026-01-20', deptId, stId, [inst2]);
    await upsertShift(token, '2026-01-30', deptId, stId, [inst3]);

    const res = await app.request('/api/shifts?limit=2', authHeader(token), envWith({}));
    expect(res.status).toBe(200);
    const body = shiftListSchema.parse(await res.json());
    // date 昇順で先頭2件（01-10, 01-20）のみ返り、01-30 は含まれない
    expect(body).toHaveLength(2);
    expect(body[0]?.assignedInstructorIds).toEqual([inst1]);
    expect(body[1]?.assignedInstructorIds).toEqual([inst2]);
  });

  it('limit 未指定でも既定100件を超えない（D1 バインド上限のチャンク境界を跨ぐ割り当て取得も正しい）', async () => {
    // 1部門 × 4シフト種別 × 31日 = 124件のシフトを月次一括 upsert で作成し、
    // 既定 limit（100件）で切り捨てられること、割り当ても100件分だけ正しく紐づくことを確認する。
    // 100件という chunkArray（90件刻み）の境界を跨ぐ件数にすることで、
    // 割り当て取得のチャンク分割 (90 + 10) が正しく動作することも合わせて検証する。
    const deptId = await seedDepartment();
    const shiftTypeIds = await Promise.all([
      seedShiftType('午前'),
      seedShiftType('午後'),
      seedShiftType('終日'),
      seedShiftType('夜間'),
    ]);
    const inst = await seedInstructor('山田', '太郎');
    const token = await seedToken('MANAGER');

    const cells = [];
    for (let day = 1; day <= 31; day++) {
      const date = `2026-01-${String(day).padStart(2, '0')}`;
      for (const shiftTypeId of shiftTypeIds) {
        cells.push({ date, shiftTypeId, instructorIds: [inst] });
      }
    }
    expect(cells.length).toBeGreaterThan(100);

    const upsertRes = await app.request(
      '/api/shifts/assignments',
      {
        method: 'PUT',
        ...authJsonRequest(token, { month: '2026-01', departmentCode: deptId, cells }),
      },
      envWith({}),
    );
    expect(upsertRes.status).toBe(200);

    const res = await app.request('/api/shifts', authHeader(token), envWith({}));
    expect(res.status).toBe(200);
    const body = shiftListSchema.parse(await res.json());
    expect(body).toHaveLength(100);
    expect(
      body.every(
        (s) => s.assignedInstructorIds.length === 1 && s.assignedInstructorIds[0] === inst,
      ),
    ).toBe(true);
  });

  it('部門名・部門コード・シフト種別名を JOIN で同梱する', async () => {
    const deptId = await seedDepartment('スキー', true, 'ski');
    const stId = await seedShiftType('終日');
    const token = await seedToken('MANAGER');
    const inst = await seedInstructor();
    await upsertShift(token, '2026-01-15', deptId, stId, [inst]);

    const res = await app.request('/api/shifts', authHeader(token), envWith({}));
    expect(res.status).toBe(200);
    const body = shiftListSchema.parse(await res.json());
    expect(body[0]?.departmentName).toBe('スキー');
    expect(body[0]?.departmentCode).toBe('ski');
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

// ─── GET /api/shifts/creation-context ────────────────────────────────────────────────

describe('GET /api/shifts/creation-context', () => {
  it('アクティブな部門・シフト種別と統計を返す', async () => {
    await seedDepartment('スキー', true);
    await seedDepartment('廃止部門', false);
    await seedShiftType('終日', true);
    await seedShiftType('旧種別', false);
    await seedInstructor('山田', '太郎', 'ACTIVE');
    await seedInstructor('鈴木', '花子', 'INACTIVE');
    const token = await seedToken('MEMBER');

    const res = await app.request('/api/shifts/creation-context', authHeader(token), envWith({}));
    expect(res.status).toBe(200);
    const body = shiftFormDataSchema.parse(await res.json());
    expect(body.shiftTypes).toHaveLength(1);
    expect(body.shiftTypes[0]?.name).toBe('終日');
    expect(body.stats.activeInstructorsCount).toBe(1);
    expect(body.stats.totalShiftTypes).toBe(1);
  });

  it('未認証は 401 を返す', async () => {
    const res = await app.request('/api/shifts/creation-context', {}, envWith({}));
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/shifts/assignment-editor ────────────────────────────────────────────────

describe('GET /api/shifts/assignment-editor', () => {
  it('既存シフトがなければ create モードで候補を返す', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const certId = await seedCertification(deptId);
    const inst = await seedInstructor('山田', '太郎');
    await linkCertification(inst, certId);
    const token = await seedToken('MANAGER');

    const res = await app.request(
      `/api/shifts/assignment-editor?date=2026-01-15&departmentCode=${deptId}&shiftTypeId=${stId}`,
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
    expect(body.availableInstructors[0]?.certifications).toEqual(['指導員']);
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
      `/api/shifts/assignment-editor?date=2026-01-15&departmentCode=${deptId}&shiftTypeId=${stId}`,
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
      `/api/shifts/assignment-editor?date=2026-01-15&departmentCode=${deptSki}&shiftTypeId=${stId}`,
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
      `/api/shifts/assignment-editor?date=2026-01-15&departmentCode=${deptId}&shiftTypeId=${stAfternoon}`,
      authHeader(token),
      envWith({}),
    );
    const body = shiftEditDataSchema.parse(await res.json());
    expect(body.availableInstructors[0]?.hasConflict).toBe(true);
    expect(body.conflicts).toHaveLength(1);
    expect(body.conflicts[0]?.instructorId).toBe(inst);
    expect(body.conflicts[0]?.conflictingShift.shiftTypeName).toBe('午前');
  });

  it('候補ペイロードに月外・保存済みの勤務日数を返す', async () => {
    const deptId = await seedDepartment();
    const stId = await seedShiftType();
    const certId = await seedCertification(deptId);
    const inst = await seedInstructor('山田', '太郎');
    await linkCertification(inst, certId);
    const token = await seedToken('MANAGER');

    // 対象月（2026-01）内の3件は当月ライブ計算（フロント側）の担当のため API 集計からは除外され、
    // 月外の 2025-12-20 のみがシーズン累計の土台として返る。
    await upsertShift(token, '2025-12-20', deptId, stId, [inst]);
    await upsertShift(token, '2026-01-10', deptId, stId, [inst]);
    await upsertShift(token, '2026-01-11', deptId, stId, [inst]);
    await upsertShift(token, '2026-01-14', deptId, stId, [inst]);

    const res = await app.request(
      `/api/shifts/assignment-editor?date=2026-01-15&departmentCode=${deptId}&shiftTypeId=${stId}`,
      authHeader(token),
      envWith({}),
    );
    const body = shiftEditDataSchema.parse(await res.json());

    expect(body.availableInstructors[0]?.seasonWorkDaysOutsideMonth).toBe(1);
  });

  it('パラメータ不足は 400 を返す', async () => {
    const token = await seedToken('MANAGER');
    const res = await app.request(
      '/api/shifts/assignment-editor?date=2026-01-15',
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
      `/api/shifts/assignment-editor?date=2026-01-15&departmentCode=${deptId}&shiftTypeId=${stId}`,
      authHeader(token),
      envWith({}),
    );
    expect(res.status).toBe(403);
  });
});

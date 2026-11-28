import { env } from 'cloudflare:test';
import { and, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { beforeEach, describe, expect, it } from 'vitest';

import { planPublicationWindow } from '../src/features/shifts/components/publication-plan';
import { monthDays } from '../src/features/shifts/components/shift-manager-utils';
import {
  shiftAgendaResponseSchema,
  shiftAttendanceSchema,
  shiftListSchema,
  shiftViewResponseSchema,
} from '../src/features/shifts/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import {
  departmentShiftTypes,
  instructorAvailabilities,
  instructors,
  shiftAssignments,
  shifts,
  shiftTypes,
  users,
} from '../src/server/db/schema';
import { guardShiftWrite, rethrowShiftWriteError } from '../src/server/db/shift-writes';
import { interruptBeforeBatch } from './d1-interrupt';

const db = createDb(env.DB);
const date = '2027-01-10';
const nextDate = '2027-01-11';

async function request(path: string, token: string, body?: unknown) {
  return app.request(
    `/api/${path}`,
    {
      method: body === undefined ? 'GET' : 'PUT',
      headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env,
  );
}

async function setup() {
  const [instructor] = await db
    .insert(instructors)
    .values({ lastName: '公開', firstName: '太郎', status: 'ACTIVE' })
    .returning();
  const [type] = await db.insert(shiftTypes).values({ name: '一般' }).returning();
  if (!instructor || !type) throw new Error('テストデータ作成失敗');
  await db.insert(departmentShiftTypes).values([
    { departmentCode: 'ski', shiftTypeId: type.id, sortOrder: 1 },
    { departmentCode: 'snowboard', shiftTypeId: type.id, sortOrder: 1 },
  ]);
  const instructorId = instructor.id;
  async function token(role: 'MEMBER' | 'MANAGER') {
    const [user] = await db
      .insert(users)
      .values({
        lineUserId: crypto.randomUUID(),
        displayName: role,
        role,
        instructorId: role === 'MEMBER' ? instructorId : null,
      })
      .returning();
    if (!user) throw new Error('ユーザー作成失敗');
    return signJwt(
      { userId: user.id, displayName: role, role, isActive: true },
      env.JWT_SECRET,
      env.JWT_EXPIRES_IN,
    );
  }
  const manager = await token('MANAGER');
  const member = await token('MEMBER');
  const save = (
    cells: Array<{
      date: string;
      instructorIds: string[];
      description?: string;
      expectedRevision?: number | null;
    }>,
    requirements: Array<{ date: string; requiredCount: number | null }> = [],
  ) =>
    request('shifts/assignments', manager, {
      month: '2027-01',
      departmentCode: 'ski',
      cells: cells.map((cell) => ({ ...cell, shiftTypeId: type.id })),
      requirements: requirements.map((item) => ({ ...item, shiftTypeId: type.id })),
    });
  const publish = async (dates: string[], status = 'PUBLISHED', roleToken = manager) => {
    const rows = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.departmentCode, 'ski'), eq(shifts.shiftTypeId, type.id)));
    return request('shifts/publication', roleToken, {
      month: '2027-01',
      departmentCode: 'ski',
      shiftTypeId: type.id,
      status,
      dates: dates.map((day) => ({
        date: day,
        expectedRevision:
          rows.find((row) => row.date.toISOString().slice(0, 10) === day)?.revision ?? null,
      })),
    });
  };
  return { manager, member, instructorId: instructor.id, shiftTypeId: type.id, save, publish };
}

beforeEach(async () => {
  await db.delete(instructorAvailabilities);
  await db.delete(shiftAssignments);
  await db.delete(shifts);
  await db.delete(departmentShiftTypes);
  await db.delete(shiftTypes);
  await db.delete(users);
  await db.delete(instructors);
});

describe('下書きと公開', () => {
  it('下書きを再取得でき、MEMBERの全閲覧経路と勤務実績には出ない', async () => {
    const { manager, member, instructorId, save, publish } = await setup();
    expect(
      (await save([{ date, instructorIds: [instructorId], description: '非公開の備考' }])).status,
    ).toBe(200);
    const calendar = await request('shifts/assignment-calendar?month=2027-01', manager);
    expect(shiftViewResponseSchema.parse(await calendar.json()).shifts[0]).toMatchObject({
      status: 'DRAFT',
      description: '非公開の備考',
    });
    const memberCalendar = shiftViewResponseSchema.parse(
      await (await request('shifts/calendar?month=2027-01', member)).json(),
    );
    expect(memberCalendar.shifts).toEqual([]);
    expect(memberCalendar.summary.totalShifts).toBe(0);
    expect(
      shiftAttendanceSchema.parse(
        await (await request(`shifts/attendance?dates=${date}`, member)).json(),
      ),
    ).toEqual([]);
    expect(
      shiftListSchema.parse(
        await (await request(`shifts?dateFrom=${date}&dateTo=${date}`, member)).json(),
      ),
    ).toEqual([]);
    expect(
      shiftAgendaResponseSchema.parse(
        await (await request(`shifts/agenda?cursor=${date}&limit=1`, member)).json(),
      ).days,
    ).toEqual([]);
    const stats = await request('shifts/me/season-stats', member);
    expect(JSON.stringify(await stats.json())).not.toContain('非公開の備考');
    expect((await publish([date])).status).toBe(200);
    expect(
      shiftAttendanceSchema.parse(
        await (await request(`shifts/attendance?dates=${date}`, member)).json(),
      ),
    ).toHaveLength(1);
    expect((await publish([date], 'DRAFT')).status).toBe(200);
    expect(
      shiftAttendanceSchema.parse(
        await (await request(`shifts/attendance?dates=${date}`, member)).json(),
      ),
    ).toEqual([]);
    expect(await db.select().from(shiftAssignments)).toHaveLength(1);
  });

  it('本人向け勤務実績は下書きを除外し、公開・取り消しに追随する', async () => {
    const { manager, member, instructorId, shiftTypeId } = await setup();
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const workDate = yesterday.toISOString().slice(0, 10);
    const [shift] = await db
      .insert(shifts)
      .values({ date: new Date(`${workDate}T00:00:00Z`), departmentCode: 'ski', shiftTypeId })
      .returning();
    if (!shift) throw new Error('シフト未作成');
    await db.insert(shiftAssignments).values({ shiftId: shift.id, instructorId });
    const before = await (await request('shifts/me/season-stats', member)).json();
    expect(before).toMatchObject({ summary: { currentSeasonWorkDays: 0 } });
    // 公開操作の対象月も実際の勤務日に合わせる。
    const change = (status: string, revision: number) =>
      request('shifts/publication', manager, {
        month: workDate.slice(0, 7),
        departmentCode: 'ski',
        shiftTypeId,
        status,
        dates: [{ date: workDate, expectedRevision: revision, expectedShiftId: shift.id }],
      });
    expect((await change('PUBLISHED', 0)).status).toBe(200);
    expect(await (await request('shifts/me/season-stats', member)).json()).toMatchObject({
      summary: { currentSeasonWorkDays: 1 },
    });
    expect((await change('DRAFT', 1)).status).toBe(200);
    expect(await (await request('shifts/me/season-stats', member)).json()).toMatchObject({
      summary: { currentSeasonWorkDays: 0 },
    });
  });

  it('0名・必要人数未設定の枠も一括公開でき、公開取り消しで空の枠だけ消える', async () => {
    const { manager, member, publish } = await setup();
    expect((await publish([date, nextDate])).status).toBe(200);
    const rows = await db.select().from(shifts);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === 'PUBLISHED' && row.requiredCount === null)).toBe(
      true,
    );
    const context = await request(
      'shifts/auto-assign-context?departmentCode=ski&from=2027-01-01&to=2027-01-31',
      manager,
    );
    const body = await context.json();
    expect(body).toMatchObject({
      publishedSlots: expect.arrayContaining([
        expect.objectContaining({ date }),
        expect.objectContaining({ date: nextDate }),
      ]),
    });
    expect(
      shiftViewResponseSchema.parse(
        await (await request('shifts/calendar?month=2027-01', member)).json(),
      ).shifts,
    ).toEqual([]);
    expect((await publish([date], 'DRAFT')).status).toBe(200);
    expect(await db.select().from(shifts)).toHaveLength(1);
  });

  it('公開後は配置・備考・必要人数・削除を拒否し、一括保存の他枠も変更しない', async () => {
    const { instructorId, save, publish } = await setup();
    await save(
      [{ date, instructorIds: [instructorId], description: '確定内容' }],
      [{ date, requiredCount: 2 }],
    );
    await publish([date]);
    expect(
      (
        await save([
          { date: nextDate, instructorIds: [instructorId] },
          { date, instructorIds: [] },
        ])
      ).status,
    ).toBe(409);
    expect(
      (await save([{ date, instructorIds: [instructorId], description: '変更' }])).status,
    ).toBe(409);
    expect((await save([], [{ date, requiredCount: 0 }])).status).toBe(409);
    expect(await db.select().from(shifts)).toHaveLength(1);
    expect((await db.select().from(shifts))[0]).toMatchObject({
      description: '確定内容',
      requiredCount: 2,
    });
    await publish([date], 'DRAFT');
    expect((await save([{ date, instructorIds: [] }])).status).toBe(200);
    expect((await db.select().from(shifts))[0]).toMatchObject({
      status: 'DRAFT',
      requiredCount: 2,
    });
  });

  it('一括公開は指定した部門・種別・日だけに作用する', async () => {
    const { publish, shiftTypeId } = await setup();
    await db
      .insert(shifts)
      .values({ date: new Date(`${date}T00:00:00Z`), departmentCode: 'snowboard', shiftTypeId });
    await publish([date, nextDate]);
    expect(
      (await db.select().from(shifts)).filter((row) => row.status === 'PUBLISHED'),
    ).toHaveLength(2);
    expect(
      (await db.select().from(shifts)).find((row) => row.departmentCode === 'snowboard')?.status,
    ).toBe('DRAFT');
    await publish([date], 'DRAFT');
    expect(
      (await db.select().from(shifts)).filter((row) => row.status === 'PUBLISHED'),
    ).toHaveLength(1);
  });

  it('MEMBERによる公開・取り消しを拒否する', async () => {
    const { publish, member } = await setup();
    expect((await publish([date], 'PUBLISHED', member)).status).toBe(403);
    await publish([date]);
    expect((await publish([date], 'DRAFT', member)).status).toBe(403);
  });

  /**
   * MEMBER 拒否テストと MANAGER 対照テストが共有する独立 setup。
   * 呼ぶたびに（beforeEach で空にした DB へ）同じ状態を作り、保存・公開・取り消しの本文を返す。
   */
  async function seedForRoleCheck() {
    const ctx = await setup();
    const { instructorId, shiftTypeId, save, publish } = ctx;
    await save(
      [
        { date, instructorIds: [instructorId], description: '公開前の備考' },
        { date: nextDate, instructorIds: [instructorId] },
      ],
      [{ date, requiredCount: 2 }],
    );
    await publish([nextDate]);
    const rows = await db.select().from(shifts);
    const revisionOf = (day: string) =>
      rows.find((row) => row.date.toISOString().startsWith(day))?.revision ?? null;
    return {
      ...ctx,
      bodies: {
        save: {
          path: 'shifts/assignments',
          body: {
            month: '2027-01',
            departmentCode: 'ski',
            cells: [
              {
                date,
                shiftTypeId,
                instructorIds: [],
                description: '書き換え',
                expectedRevision: revisionOf(date),
              },
            ],
            requirements: [
              { date, shiftTypeId, requiredCount: 9, expectedRevision: revisionOf(date) },
            ],
          },
        },
        publish: {
          path: 'shifts/publication',
          body: {
            month: '2027-01',
            departmentCode: 'ski',
            shiftTypeId,
            status: 'PUBLISHED',
            dates: [{ date, expectedRevision: revisionOf(date) }],
          },
        },
        cancel: {
          path: 'shifts/publication',
          body: {
            month: '2027-01',
            departmentCode: 'ski',
            shiftTypeId,
            status: 'DRAFT',
            dates: [{ date: nextDate, expectedRevision: revisionOf(nextDate) }],
          },
        },
      },
    };
  }

  it('MEMBERの保存・公開・取り消しは、成功し得る入力でも403で全対象テーブルを変えない', async () => {
    const { member, bodies } = await seedForRoleCheck();
    const tables = async () => ({
      shifts: await db.select().from(shifts).orderBy(shifts.date),
      assignments: await db.select().from(shiftAssignments).orderBy(shiftAssignments.shiftId),
      availabilities: await db.select().from(instructorAvailabilities),
    });
    const before = await tables();

    const saved = await request(bodies.save.path, member, bodies.save.body);
    const published = await request(bodies.publish.path, member, bodies.publish.body);
    const cancelled = await request(bodies.cancel.path, member, bodies.cancel.body);

    expect([saved.status, published.status, cancelled.status]).toEqual([403, 403, 403]);
    expect(await tables()).toEqual(before);
  });

  // 対照: 上のテストと同じ本文を、独立した setup で MANAGER が送れば成功する
  // （MEMBER の 403 が入力不正・古い世代によるものではないことの確認）
  it.each(['save', 'publish', 'cancel'] as const)(
    '対照: MEMBER 拒否テストと同じ%s本文は、独立setupでMANAGERなら200になる',
    async (kind) => {
      const { manager, bodies } = await seedForRoleCheck();

      const response = await request(bodies[kind].path, manager, bodies[kind].body);

      expect(response.status).toBe(200);
    },
  );

  it('古い画面からの保存と公開は新しい配置を上書きしない', async () => {
    const { manager, instructorId, shiftTypeId, save } = await setup();
    await save([{ date, instructorIds: [instructorId] }]);
    await save([
      { date, instructorIds: [instructorId], description: '新しい内容', expectedRevision: 0 },
    ]);
    expect((await save([{ date, instructorIds: [], expectedRevision: 0 }])).status).toBe(409);
    const result = await request('shifts/publication', manager, {
      month: '2027-01',
      departmentCode: 'ski',
      shiftTypeId,
      status: 'PUBLISHED',
      dates: [{ date, expectedRevision: 0 }],
    });
    expect(result.status).toBe(409);
    expect((await db.select().from(shifts))[0]).toMatchObject({
      description: '新しい内容',
      status: 'DRAFT',
    });
  });

  it('同じ日で削除・再作成され更新世代が0に戻っても、旧枠の保存と公開を拒否する', async () => {
    const { manager, instructorId, shiftTypeId, save } = await setup();
    await save([{ date, instructorIds: [instructorId] }]);
    const original = (await db.select().from(shifts))[0];
    if (!original) throw new Error('シフト未作成');
    await save([{ date, instructorIds: [] }]);
    await save([{ date, instructorIds: [instructorId], description: '再作成' }]);
    const result = await request('shifts/assignments', manager, {
      month: '2027-01',
      departmentCode: 'ski',
      cells: [
        { date, shiftTypeId, instructorIds: [], expectedRevision: 0, expectedShiftId: original.id },
      ],
    });
    expect(result.status).toBe(409);
    const publication = await request('shifts/publication', manager, {
      month: '2027-01',
      departmentCode: 'ski',
      shiftTypeId,
      status: 'PUBLISHED',
      dates: [{ date, expectedRevision: 0, expectedShiftId: original.id }],
    });
    expect(publication.status).toBe(409);
    expect((await db.select().from(shifts))[0]).toMatchObject({
      description: '再作成',
      status: 'DRAFT',
    });
  });

  it('確認後に公開された場合、DBガードがバッチ全体をロールバックする', async () => {
    const { instructorId, save, publish } = await setup();
    await save([
      { date, instructorIds: [instructorId] },
      { date: nextDate, instructorIds: [instructorId] },
    ]);
    const saved = await db.select().from(shifts);
    const first = saved.find((row) => row.date.toISOString().startsWith(date));
    const second = saved.find((row) => row.date.toISOString().startsWith(nextDate));
    if (!first || !second) throw new Error('シフト未作成');
    await publish([nextDate]);
    await expect(
      db.batch([
        guardShiftWrite(db, first, first).operation,
        db.update(shifts).set({ description: '部分保存させない' }).where(eq(shifts.id, first.id)),
        guardShiftWrite(db, second, second).operation,
        db.delete(shiftAssignments).where(eq(shiftAssignments.shiftId, second.id)),
      ]),
    ).rejects.toThrow();
    expect(
      (await db.select().from(shifts)).find((row) => row.id === first.id)?.description,
    ).toBeNull();
    expect(await db.select().from(shiftAssignments)).toHaveLength(2);
  });
});

describe('月の公開範囲の置き換え', () => {
  async function windowInput(manager: string, shiftTypeId: string, through: string | null) {
    const response = await request('shifts/assignment-calendar?month=2027-01', manager);
    const calendar = shiftViewResponseSchema.parse(await response.json());
    const saved = new Map(
      calendar.shifts
        .filter((shift) => shift.department.code === 'ski')
        .map((shift) => [`${shift.date}:${shift.shiftType.id}`, shift]),
    );
    return planPublicationWindow(
      { month: '2027-01', departmentCode: 'ski', shiftTypeId },
      monthDays('2027-01'),
      through,
      saved,
    );
  }

  it('月初から終了日までを公開し、期間外の公開済み配置を保持したまま非公開に戻す', async () => {
    const { manager, instructorId, shiftTypeId, save, publish } = await setup();
    await save([
      { date, instructorIds: [instructorId] },
      { date: nextDate, instructorIds: [instructorId] },
    ]);
    await publish([nextDate]);
    const input = await windowInput(manager, shiftTypeId, date);
    const response = await request('shifts/publication', manager, input);
    expect(response.status).toBe(200);
    const rows = await db.select().from(shifts);
    expect(rows.filter((row) => row.status === 'PUBLISHED')).toHaveLength(10);
    expect(rows.find((row) => row.date.toISOString().startsWith(nextDate))?.status).toBe('DRAFT');
    expect(await db.select().from(shiftAssignments)).toHaveLength(2);
    const allPrivate = await windowInput(manager, shiftTypeId, null);
    expect((await request('shifts/publication', manager, allPrivate)).status).toBe(200);
    expect((await db.select().from(shifts)).every((row) => row.status === 'DRAFT')).toBe(true);
    expect(await db.select().from(shifts)).toHaveLength(2);
  });

  it('新たに公開する枠が勤務不可なら、期間外の公開取り消しも含め全体を拒否する', async () => {
    const { manager, instructorId, shiftTypeId, save, publish } = await setup();
    await save([
      { date, instructorIds: [instructorId] },
      { date: nextDate, instructorIds: [instructorId] },
    ]);
    await publish([nextDate]);
    await db
      .insert(instructorAvailabilities)
      .values({ instructorId, date: new Date(`${date}T00:00:00Z`), type: 'UNAVAILABLE' });
    const input = await windowInput(manager, shiftTypeId, date);
    expect((await request('shifts/publication', manager, input)).status).toBe(409);
    expect(
      (await db.select().from(shifts)).find((row) => row.date.toISOString().startsWith(nextDate))
        ?.status,
    ).toBe('PUBLISHED');
  });

  it('期間外で非公開の枠に勤務不可の配置があっても、公開範囲の更新を妨げない', async () => {
    const { manager, instructorId, shiftTypeId, save } = await setup();
    await save([{ date: nextDate, instructorIds: [instructorId] }]);
    await db
      .insert(instructorAvailabilities)
      .values({ instructorId, date: new Date(`${nextDate}T00:00:00Z`), type: 'UNAVAILABLE' });
    const input = await windowInput(manager, shiftTypeId, date);
    expect((await request('shifts/publication', manager, input)).status).toBe(200);
    expect(
      (await db.select().from(shifts)).filter((row) => row.status === 'PUBLISHED'),
    ).toHaveLength(10);
  });
});

describe('公開と本人の勤務可否', () => {
  it('下書きでは希望を変更でき、勤務不可になったら一括公開は全体を拒否する', async () => {
    const { member, instructorId, save, publish } = await setup();
    await save([{ date, instructorIds: [instructorId] }]);
    expect(
      (await request('availabilities/me', member, { changes: [{ date, type: 'UNAVAILABLE' }] }))
        .status,
    ).toBe(200);
    expect((await publish([nextDate, date])).status).toBe(409);
    expect((await db.select().from(shifts)).every((row) => row.status === 'DRAFT')).toBe(true);
    expect(await db.select().from(shifts)).toHaveLength(1);
  });

  it('公開済みの本人配置だけをロックし、取り消し後は再び変更できる', async () => {
    const { member, instructorId, save, publish } = await setup();
    await save([{ date, instructorIds: [instructorId] }]);
    await publish([date, nextDate]);
    const response = await request(`availabilities/me?from=${date}&to=${nextDate}`, member);
    expect(await response.json()).toMatchObject({ lockedDates: [date] });
    expect(
      (await request('availabilities/me', member, { changes: [{ date, type: 'AVOID' }] })).status,
    ).toBe(409);
    expect(
      (
        await request('availabilities/me', member, {
          changes: [{ date: nextDate, type: 'UNAVAILABLE' }],
        })
      ).status,
    ).toBe(200);
    await publish([date], 'DRAFT');
    expect(
      (await request('availabilities/me', member, { changes: [{ date, type: 'UNAVAILABLE' }] }))
        .status,
    ).toBe(200);
  });

  it('公開後の申告変更は事前チェックを通さないDB書き込みでも拒否する', async () => {
    const { instructorId, save, publish } = await setup();
    await save([{ date, instructorIds: [instructorId] }]);
    await publish([date]);
    await expect(
      db
        .insert(instructorAvailabilities)
        .values({ instructorId, date: new Date(`${date}T00:00:00Z`), type: 'UNAVAILABLE' }),
    ).rejects.toThrow();
  });
});

describe('不正な入力は部分保存せず400で拒否する', () => {
  const freeDate = '2027-01-12';

  /** 保存・公開が対象にする全テーブルの内容。更新世代（revision）と必要人数もここに含まれる */
  async function snapshot() {
    return {
      shifts: await db.select().from(shifts).orderBy(shifts.date, shifts.id),
      assignments: await db
        .select()
        .from(shiftAssignments)
        .orderBy(shiftAssignments.shiftId, shiftAssignments.instructorId),
    };
  }

  /** 既存の下書き（配置・備考・必要人数・更新世代あり）を用意する */
  async function seedExisting() {
    const ctx = await setup();
    const [otherType] = await db.insert(shiftTypes).values({ name: '部門外の種別' }).returning();
    if (!otherType) throw new Error('種別作成失敗');
    const saved = await ctx.save(
      [{ date, instructorIds: [ctx.instructorId], description: '既存の備考' }],
      [{ date, requiredCount: 3 }],
    );
    expect(saved.status).toBe(200);
    return { ...ctx, otherTypeId: otherType.id };
  }

  const validCell = (instructorId: string, shiftTypeId: string) => ({
    date: freeDate,
    shiftTypeId,
    instructorIds: [instructorId],
    description: '正常枠なので保存されてはならない',
  });

  it.each([
    ['重複した枠', '同じ枠が重複しています', (d: string) => [{ date: d }, { date: d }]],
    ['実在しない日付', '実在しない日付', () => [{ date: '2027-01-32' }]],
    ['対象月外の日付', '範囲外', () => [{ date: '2027-02-01' }]],
  ])(
    '保存: %sは400で、正常な枠も含め shifts・割当・更新世代・必要人数を変えない',
    async (_name, expectedMessage, invalid) => {
      const { manager, instructorId, shiftTypeId } = await seedExisting();
      const before = await snapshot();

      const response = await request('shifts/assignments', manager, {
        month: '2027-01',
        departmentCode: 'ski',
        cells: [
          validCell(instructorId, shiftTypeId),
          ...invalid(date).map((item) => ({ ...item, shiftTypeId, instructorIds: [] })),
        ],
        requirements: [{ date: freeDate, shiftTypeId, requiredCount: 5 }],
      });

      expect(response.status).toBe(400);
      expect(JSON.stringify(await response.json())).toContain(expectedMessage);
      expect(await snapshot()).toEqual(before);
    },
  );

  it('保存: 必要人数だけに含まれる実在しない日付も400で、正常な必要人数を変えない', async () => {
    const { manager, shiftTypeId } = await seedExisting();
    const before = await snapshot();

    const response = await request('shifts/assignments', manager, {
      month: '2027-01',
      departmentCode: 'ski',
      cells: [],
      requirements: [
        { date, shiftTypeId, requiredCount: 9 },
        { date: '2027-01-32', shiftTypeId, requiredCount: 1 },
      ],
    });

    expect(response.status).toBe(400);
    expect(await snapshot()).toEqual(before);
  });

  it('保存: 部門で利用できないシフト種別は400で、既存の枠を変えない', async () => {
    const { manager, instructorId, otherTypeId } = await seedExisting();
    const before = await snapshot();

    const response = await request('shifts/assignments', manager, {
      month: '2027-01',
      departmentCode: 'ski',
      cells: [validCell(instructorId, otherTypeId)],
      requirements: [{ date: freeDate, shiftTypeId: otherTypeId, requiredCount: 5 }],
    });

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain('部門で利用できない');
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    ['重複した日付', '重複のない対象月内の実在日', [date, date]],
    ['実在しない日付', '重複のない対象月内の実在日', [date, '2027-01-32']],
    ['対象月外の日付', '重複のない対象月内の実在日', [date, '2027-02-01']],
  ])(
    '公開: %sは400で、正常な日も公開されず更新世代を変えない',
    async (_name, expectedMessage, dates) => {
      const { manager, shiftTypeId } = await seedExisting();
      const before = await snapshot();

      const response = await request('shifts/publication', manager, {
        month: '2027-01',
        departmentCode: 'ski',
        shiftTypeId,
        status: 'PUBLISHED',
        dates: dates.map((day) => ({ date: day, expectedRevision: null })),
      });

      expect(response.status).toBe(400);
      expect(JSON.stringify(await response.json())).toContain(expectedMessage);
      expect(await snapshot()).toEqual(before);
    },
  );

  it('公開: 部門で利用できないシフト種別は400で、既存の枠を変えない', async () => {
    const { manager, otherTypeId } = await seedExisting();
    const before = await snapshot();

    const response = await request('shifts/publication', manager, {
      month: '2027-01',
      departmentCode: 'ski',
      shiftTypeId: otherTypeId,
      status: 'PUBLISHED',
      dates: [{ date, expectedRevision: null }],
    });

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain('部門で利用できない');
    expect(await snapshot()).toEqual(before);
  });
});

/** 関数が投げた値（または reject 理由）を返す。投げなければ undefined */
async function caught(fn: () => unknown): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('確認後の競合割り込みと409変換（決定論的な割り込み）', () => {
  // 事前確認の後・書き込み batch の前に別の書き込みを一度だけ挟む。
  // 複数HTTPリクエストの真の同時実行ではなく、その順序を再現する検証である。
  async function snapshot() {
    return {
      shifts: await db.select().from(shifts).orderBy(shifts.date, shifts.id),
      assignments: await db
        .select()
        .from(shiftAssignments)
        .orderBy(shiftAssignments.shiftId, shiftAssignments.instructorId),
      availabilities: await db
        .select()
        .from(instructorAvailabilities)
        .orderBy(instructorAvailabilities.instructorId, instructorAvailabilities.date),
    };
  }

  function requestWithDb(
    path: string,
    token: string,
    body: unknown,
    wrapped: D1Database,
  ): Promise<Response> {
    return Promise.resolve(
      app.request(
        `/api/${path}`,
        {
          method: 'PUT',
          headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        { ...env, DB: wrapped },
      ),
    );
  }

  it('公開の事前確認後に担当者が勤務不可になると、実トリガーが全日の公開を拒否して409を返す', async () => {
    const { manager, instructorId, shiftTypeId, save } = await setup();
    await save([
      { date, instructorIds: [instructorId] },
      { date: nextDate, instructorIds: [instructorId], description: '備考' },
    ]);
    // 競合注入の直後（公開 batch の実行前）に取る全関連行のスナップショット。比較基準
    let baseline: Awaited<ReturnType<typeof snapshot>> | undefined;
    const interruption = interruptBeforeBatch(env.DB, async () => {
      await db
        .insert(instructorAvailabilities)
        .values({ instructorId, date: new Date(`${nextDate}T00:00:00Z`), type: 'UNAVAILABLE' });
      baseline = await snapshot();
    });
    const rows = await db.select().from(shifts);
    const dates = rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      expectedRevision: row.revision,
      expectedShiftId: row.id,
    }));

    const response = await requestWithDb(
      'shifts/publication',
      manager,
      { month: '2027-01', departmentCode: 'ski', shiftTypeId, status: 'PUBLISHED', dates },
      interruption.db,
    );

    expect(interruption.interruptCount()).toBe(1);
    expect(response.status).toBe(409);
    // 事前確認の 409 ではなく、実トリガーを変換した 409 の文言であることを確認する
    expect(JSON.stringify(await response.json())).toContain('勤務可否を確認してください');
    const after = await snapshot();
    expect(baseline).toBeDefined();
    expect(after).toEqual(baseline);
    expect(after.shifts.map((row) => row.status)).toEqual(['DRAFT', 'DRAFT']);
    // 競合書き込み（勤務不可の申告）はロールバックされず残る
    expect(after.availabilities).toHaveLength(1);
  });

  it('保存の確認後に別の保存で更新世代が進むと、先行セルを含む保存全体をロールバックして409を返す', async () => {
    const { manager, instructorId, shiftTypeId, save } = await setup();
    await save([
      { date, instructorIds: [instructorId], description: '先行セルの元の備考' },
      { date: nextDate, instructorIds: [instructorId], description: '元の備考' },
    ]);
    const [first, second] = (await db.select().from(shifts).orderBy(shifts.date)).map((row) => row);
    if (!first || !second) throw new Error('シフト未作成');
    // 競合注入の直後（保存 batch の実行前）に取る全関連行のスナップショット。比較基準
    let baseline: Awaited<ReturnType<typeof snapshot>> | undefined;
    const interruption = interruptBeforeBatch(env.DB, async () => {
      // 画面が確認した後に、別の操作が2枠目を保存して更新世代を進めた状況
      await db
        .update(shifts)
        .set({ description: '別の操作が保存した備考', revision: second.revision + 1 })
        .where(eq(shifts.id, second.id));
      baseline = await snapshot();
    });

    const response = await requestWithDb(
      'shifts/assignments',
      manager,
      {
        month: '2027-01',
        departmentCode: 'ski',
        cells: [
          {
            date,
            shiftTypeId,
            instructorIds: [],
            description: '先行セルの新しい備考',
            expectedRevision: first.revision,
            expectedShiftId: first.id,
          },
          {
            date: nextDate,
            shiftTypeId,
            instructorIds: [],
            description: '2枠目の新しい備考',
            expectedRevision: second.revision,
            expectedShiftId: second.id,
          },
        ],
      },
      interruption.db,
    );

    expect(interruption.interruptCount()).toBe(1);
    expect(response.status).toBe(409);
    const after = await snapshot();
    // 全関連行（status・requiredCount・updatedAt・割当・申告を含む）が競合注入後の状態から変わらない。
    // 先行セルの書き込みはロールバックされ、競合書き込み（2枠目の備考・世代）は残る
    expect(baseline).toBeDefined();
    expect(after).toEqual(baseline);
    expect(after.shifts[0]).toMatchObject({ description: '先行セルの元の備考' });
    expect(after.shifts[1]).toMatchObject({
      description: '別の操作が保存した備考',
      revision: second.revision + 1,
    });
  });

  it('実D1の重複キー違反は実関数で409に変換され、未知のDBエラーはそのまま投げる', async () => {
    const { shiftTypeId } = await setup();
    const key = { date: new Date(`${date}T00:00:00Z`), departmentCode: 'ski', shiftTypeId };
    await db.insert(shifts).values(key);
    const duplicate = await caught(() => db.insert(shifts).values(key));
    expect(duplicate).toBeInstanceOf(Error);
    const converted = await caught(() => rethrowShiftWriteError(duplicate));
    expect(converted).toBeInstanceOf(HTTPException);
    expect(converted).toMatchObject({ status: 409 });

    const unknownError = await caught(() =>
      env.DB.prepare('INSERT INTO no_such_table VALUES (1)').run(),
    );
    expect(unknownError).toBeInstanceOf(Error);
    const rethrown = await caught(() => rethrowShiftWriteError(unknownError));
    expect(rethrown).toBe(unknownError);
    expect(rethrown).not.toBeInstanceOf(HTTPException);
  });
});

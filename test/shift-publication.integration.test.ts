import { env } from 'cloudflare:test';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

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
import { guardShiftWrite } from '../src/server/db/shift-writes';

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
      { userId: user.id, lineUserId: user.lineUserId, displayName: role, role, isActive: true },
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
    const calendar = await request('shifts/calendar?month=2027-01', manager);
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

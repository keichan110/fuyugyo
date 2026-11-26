import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { notificationListResponseSchema } from '../src/features/notifications/schema';
import { shiftAttendanceSchema } from '../src/features/shifts/schema';
import app from '../src/index';
import { signJwt, type UserRole } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import {
  departmentShiftTypes,
  instructorAvailabilities,
  instructors,
  notifications,
  shiftAssignments,
  shifts,
  shiftTypes,
  users,
} from '../src/server/db/schema';
import { interruptBeforeBatch } from './d1-interrupt';

const db = createDb(env.DB);
const first = '2027-01-10';
const second = '2027-01-11';
const third = '2027-01-12';
const TITLE = 'シフトが公開されました';

type DateInput = {
  date: string;
  status?: 'DRAFT' | 'PUBLISHED';
  expectedRevision?: number | null;
  expectedShiftId?: string | null;
};

function put(path: string, token: string, body: unknown, d1: D1Database = env.DB) {
  return Promise.resolve(
    app.request(
      `/api/${path}`,
      {
        method: 'PUT',
        headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      { ...env, DB: d1 },
    ),
  );
}

function get(path: string, token: string) {
  return app.request(`/api/${path}`, { headers: { cookie: `auth-token=${token}` } }, env);
}

async function createInstructor(firstName: string): Promise<string> {
  const [instructor] = await db
    .insert(instructors)
    .values({ lastName: '通知', firstName, status: 'ACTIVE' })
    .returning();
  if (!instructor) throw new Error('インストラクター作成失敗');
  return instructor.id;
}

async function createUser(role: UserRole, instructorId: string | null, isActive = true) {
  const [user] = await db
    .insert(users)
    .values({
      lineUserId: crypto.randomUUID(),
      displayName: role,
      role,
      instructorId,
      isActive,
    })
    .returning();
  if (!user) throw new Error('ユーザー作成失敗');
  const token = await signJwt(
    { userId: user.id, displayName: role, role, isActive },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN,
  );
  return { id: user.id, token };
}

/**
 * 操作者（担当にもなれる MANAGER）、担当者2人、無効ユーザー、担当外ユーザー、
 * ユーザー未連携のインストラクターを用意する。
 */
async function setup() {
  const [type] = await db.insert(shiftTypes).values({ name: '一般' }).returning();
  if (!type) throw new Error('種別作成失敗');
  // 巻き上げられる関数内では型の絞り込みが効かないため、ID を取り出しておく
  const shiftTypeId = type.id;
  await db.insert(departmentShiftTypes).values([
    { departmentCode: 'ski', shiftTypeId, sortOrder: 1 },
    { departmentCode: 'snowboard', shiftTypeId, sortOrder: 1 },
  ]);
  const instructorIds = {
    operator: await createInstructor('操作者'),
    alice: await createInstructor('担当A'),
    bob: await createInstructor('担当B'),
    inactive: await createInstructor('無効'),
    outsider: await createInstructor('担当外'),
    unlinked: await createInstructor('未連携'),
  };
  const operator = await createUser('MANAGER', instructorIds.operator);
  const alice = await createUser('MEMBER', instructorIds.alice);
  const bob = await createUser('MEMBER', instructorIds.bob);
  const inactive = await createUser('MEMBER', instructorIds.inactive, false);
  const outsider = await createUser('MEMBER', instructorIds.outsider);

  /** 保存済みの枠を担当者付きで直接用意し、枠 ID を返す。 */
  async function seed(
    date: string,
    assigned: string[],
    options: { departmentCode?: 'ski' | 'snowboard'; status?: 'DRAFT' | 'PUBLISHED' } = {},
  ): Promise<string> {
    const [shift] = await db
      .insert(shifts)
      .values({
        date: new Date(`${date}T00:00:00Z`),
        departmentCode: options.departmentCode ?? 'ski',
        shiftTypeId,
        status: options.status ?? 'DRAFT',
      })
      .returning();
    if (!shift) throw new Error('シフト作成失敗');
    for (const instructorId of assigned) {
      await db.insert(shiftAssignments).values({ shiftId: shift.id, instructorId });
    }
    return shift.id;
  }

  /** 公開 API の本文を作る。世代を省略した日は、現在保存されている世代を使う。 */
  async function publication(
    dates: DateInput[],
    status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED',
    departmentCode: 'ski' | 'snowboard' = 'ski',
  ) {
    const rows = await db.select().from(shifts);
    return {
      month: '2027-01',
      departmentCode,
      shiftTypeId,
      status,
      dates: dates.map((item) => ({
        expectedRevision:
          rows.find(
            (row) =>
              row.departmentCode === departmentCode && row.date.toISOString().startsWith(item.date),
          )?.revision ?? null,
        ...item,
      })),
    };
  }

  async function publish(
    dates: string[],
    status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED',
    departmentCode: 'ski' | 'snowboard' = 'ski',
  ) {
    const body = await publication(
      dates.map((date) => ({ date })),
      status,
      departmentCode,
    );
    return put('shifts/publication', operator.token, body);
  }

  return {
    shiftTypeId,
    instructorIds,
    operator,
    alice,
    bob,
    inactive,
    outsider,
    seed,
    publication,
    publish,
  };
}

/** 保存されている通知を、宛先とイベントキーの順で読む。 */
function savedNotifications() {
  return db.select().from(notifications).orderBy(notifications.userId, notifications.eventKey);
}

/** 公開操作が変えうる全行（公開状態・更新世代・通知）を読む。 */
async function snapshot() {
  return {
    shifts: await db.select().from(shifts).orderBy(shifts.date, shifts.id),
    assignments: await db
      .select()
      .from(shiftAssignments)
      .orderBy(shiftAssignments.shiftId, shiftAssignments.instructorId),
    notifications: await savedNotifications(),
  };
}

/** 枠 ID と公開後の世代から、期待するイベントキーを作る。 */
function eventKeyOf(slots: Array<[string, number]>): string {
  const sorted = [...slots].sort(([left], [right]) => (left < right ? -1 : 1));
  return `shift-publication:v1:${JSON.stringify(sorted)}`;
}

beforeEach(async () => {
  await db.delete(notifications);
  await db.delete(instructorAvailabilities);
  await db.delete(shiftAssignments);
  await db.delete(shifts);
  await db.delete(departmentShiftTypes);
  await db.delete(shiftTypes);
  await db.delete(users);
  await db.delete(instructors);
});

describe('シフト公開の通知', () => {
  it('本人の公開日を1件にまとめ、有効な担当ユーザーだけに届ける', async () => {
    const ctx = await setup();
    const { operator, alice, bob, instructorIds } = ctx;
    const firstId = await ctx.seed(first, [
      instructorIds.bob,
      instructorIds.inactive,
      instructorIds.unlinked,
    ]);
    const secondId = await ctx.seed(second, [instructorIds.alice, instructorIds.operator]);
    const thirdId = await ctx.seed(third, [instructorIds.alice, instructorIds.bob]);
    // 今回の公開対象でない枠の担当は宛先にも本文にも含めない
    await ctx.seed('2027-01-13', [instructorIds.alice, instructorIds.outsider]);

    // 要求順を日付の降順にしても、本文・リンク・イベントキーは変わらない
    const response = await ctx.publish([third, second, first]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ changedCount: 3 });
    const saved = await savedNotifications();
    expect(saved.map((row) => row.userId).sort()).toEqual([alice.id, bob.id, operator.id].sort());
    const eventKey = eventKeyOf([
      [firstId, 1],
      [secondId, 1],
      [thirdId, 1],
    ]);
    expect(saved.find((row) => row.userId === alice.id)).toMatchObject({
      title: TITLE,
      body: `${second} / スキー / 一般\n${third} / スキー / 一般`,
      actionUrl: `/shifts?date=${second}`,
      eventKey,
      readAt: null,
    });
    expect(saved.find((row) => row.userId === bob.id)).toMatchObject({
      body: `${first} / スキー / 一般\n${third} / スキー / 一般`,
      actionUrl: `/shifts?date=${first}`,
      eventKey,
    });
    expect(saved.find((row) => row.userId === operator.id)).toMatchObject({
      body: `${second} / スキー / 一般`,
      actionUrl: `/shifts?date=${second}`,
      eventKey,
    });
  });

  it('本文の部門名は公開した部門の表示名になる', async () => {
    const ctx = await setup();
    await ctx.seed(first, [ctx.instructorIds.alice], { departmentCode: 'snowboard' });

    expect((await ctx.publish([first], 'PUBLISHED', 'snowboard')).status).toBe(200);

    expect(await savedNotifications()).toEqual([
      expect.objectContaining({
        userId: ctx.alice.id,
        body: `${first} / スノーボード / 一般`,
      }),
    ]);
  });

  it('担当者がいない公開は、通知を作らずに成功する', async () => {
    const ctx = await setup();
    await ctx.seed(first, []);

    // 保存済みの空枠と、公開時に新しく作る枠
    const response = await ctx.publish([first, second]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ changedCount: 2 });
    expect(await savedNotifications()).toEqual([]);
  });

  it('公開済み・新規公開・公開取り消しが混在する場合は、新しく公開する枠だけを知らせる', async () => {
    const ctx = await setup();
    const { alice, bob, instructorIds } = ctx;
    await ctx.seed(first, [instructorIds.alice, instructorIds.bob], { status: 'PUBLISHED' });
    const secondId = await ctx.seed(second, [instructorIds.alice]);
    await ctx.seed(third, [instructorIds.bob], { status: 'PUBLISHED' });

    const body = await ctx.publication([
      { date: first, status: 'PUBLISHED' },
      { date: second, status: 'PUBLISHED' },
      { date: third, status: 'DRAFT' },
    ]);
    const response = await put('shifts/publication', ctx.operator.token, body);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ changedCount: 2 });
    const saved = await savedNotifications();
    expect(saved).toEqual([
      expect.objectContaining({
        userId: alice.id,
        body: `${second} / スキー / 一般`,
        actionUrl: `/shifts?date=${second}`,
        eventKey: eventKeyOf([[secondId, 1]]),
      }),
    ]);
    expect(saved.some((row) => row.userId === bob.id)).toBe(false);
  });

  it('公開済みの再指定・変更なし・取り消し・拒否される要求では通知が増えない', async () => {
    const ctx = await setup();
    const { operator, instructorIds, shiftTypeId } = ctx;
    const firstId = await ctx.seed(first, [instructorIds.alice]);
    await ctx.seed(second, [instructorIds.bob]);
    expect((await ctx.publish([first])).status).toBe(200);
    const initial = await savedNotifications();
    expect(initial).toHaveLength(1);

    // 変更なし
    const unchanged = await ctx.publish([first]);
    expect(await unchanged.json()).toEqual({ changedCount: 0 });
    // 状態をまとめて揃える操作での公開済みの再指定（枠への書き込みは発生する）
    const restated = await put(
      'shifts/publication',
      operator.token,
      await ctx.publication([{ date: first, status: 'PUBLISHED' }]),
    );
    expect(restated.status).toBe(200);
    expect(await savedNotifications()).toEqual(initial);

    const base = { month: '2027-01', departmentCode: 'ski', shiftTypeId, status: 'PUBLISHED' };
    // 検証エラー（重複した日付）
    const invalid = await put('shifts/publication', operator.token, {
      ...base,
      dates: [
        { date: second, expectedRevision: 0 },
        { date: second, expectedRevision: 0 },
      ],
    });
    expect(invalid.status).toBe(400);
    // 古い更新世代
    const staleRevision = await put('shifts/publication', operator.token, {
      ...base,
      dates: [{ date: second, expectedRevision: 9 }],
    });
    expect(staleRevision.status).toBe(409);
    // 古い枠 ID
    const staleId = await put('shifts/publication', operator.token, {
      ...base,
      dates: [{ date: second, expectedRevision: 0, expectedShiftId: firstId }],
    });
    expect(staleId.status).toBe(409);
    expect(await savedNotifications()).toEqual(initial);

    // 公開取り消し
    expect((await ctx.publish([first], 'DRAFT')).status).toBe(200);
    expect(await savedNotifications()).toEqual(initial);
  });

  it('取り消し後の再公開は新しい未読になり、以前の本文と既読日時を残す', async () => {
    const ctx = await setup();
    const { alice, instructorIds } = ctx;
    const firstId = await ctx.seed(first, [instructorIds.alice]);
    await ctx.seed(second, [instructorIds.alice]);
    await ctx.publish([first]);
    const [original] = await savedNotifications();
    if (!original) throw new Error('通知未作成');
    expect((await put(`notifications/${original.id}/read`, alice.token, {})).status).toBe(200);
    const [read] = await savedNotifications();
    expect(read?.readAt).not.toBeNull();

    await ctx.publish([first], 'DRAFT');
    // リンク先は通知を保存した時点ではなく、閲覧時点のシフト状態を返す
    const attendance = async () =>
      shiftAttendanceSchema.parse(
        await (await get(`shifts/attendance?dates=${first}`, alice.token)).json(),
      );
    expect(await attendance()).toEqual([]);
    await ctx.publish([first, second]);
    expect(await attendance()).toHaveLength(1);

    const saved = await savedNotifications();
    expect(saved).toHaveLength(2);
    expect(saved.find((row) => row.id === original.id)).toEqual(read);
    expect(saved.find((row) => row.id !== original.id)).toMatchObject({
      body: `${first} / スキー / 一般\n${second} / スキー / 一般`,
      actionUrl: `/shifts?date=${first}`,
      readAt: null,
    });
    expect(saved.find((row) => row.id !== original.id)?.eventKey).toContain(`["${firstId}",3]`);
    const inbox = notificationListResponseSchema.parse(
      await (await get('notifications/me', alice.token)).json(),
    );
    expect(inbox.unreadCount).toBe(1);
    expect(inbox.items).toHaveLength(2);
  });
});

describe('公開と通知の原子性', () => {
  it('同じ枠の公開が競合した場合は、成功した公開だけが通知を作る', async () => {
    const ctx = await setup();
    const { operator, instructorIds } = ctx;
    const firstId = await ctx.seed(first, [instructorIds.alice, instructorIds.bob]);
    const body = await ctx.publication([{ date: first }]);
    // 後続の公開が宛先まで読んだ後、書き込む直前に先行の公開を確定させる
    let winnerStatus: number | undefined;
    const interruption = interruptBeforeBatch(env.DB, async () => {
      winnerStatus = (await put('shifts/publication', operator.token, body)).status;
    });

    const loser = await put('shifts/publication', operator.token, body, interruption.db);

    expect(interruption.interruptCount()).toBe(1);
    expect(winnerStatus).toBe(200);
    expect(loser.status).toBe(409);
    const saved = await savedNotifications();
    expect(saved).toHaveLength(2);
    expect(new Set(saved.map((row) => row.eventKey))).toEqual(
      new Set([eventKeyOf([[firstId, 1]])]),
    );
  });

  it('宛先の取得後に担当が変わった場合は、公開も通知もせず409を返す', async () => {
    const ctx = await setup();
    const { operator, instructorIds, shiftTypeId } = ctx;
    await ctx.seed(first, [instructorIds.alice]);
    const body = await ctx.publication([{ date: first }]);
    let baseline: Awaited<ReturnType<typeof snapshot>> | undefined;
    const interruption = interruptBeforeBatch(env.DB, async () => {
      const changed = await put('shifts/assignments', operator.token, {
        month: '2027-01',
        departmentCode: 'ski',
        cells: [{ date: first, shiftTypeId, instructorIds: [instructorIds.bob] }],
      });
      expect(changed.status).toBe(200);
      baseline = await snapshot();
    });

    const response = await put('shifts/publication', operator.token, body, interruption.db);

    expect(response.status).toBe(409);
    expect(baseline).toBeDefined();
    expect(await snapshot()).toEqual(baseline);
    expect(await savedNotifications()).toEqual([]);
  });

  it('通知の保存に失敗すると、公開状態・更新世代・通知をまとめて元に戻す', async () => {
    const ctx = await setup();
    const { instructorIds } = ctx;
    await ctx.seed(first, [instructorIds.alice, instructorIds.bob]);
    await ctx.seed(second, [instructorIds.alice], { status: 'PUBLISHED' });
    const body = await ctx.publication([
      { date: first, status: 'PUBLISHED' },
      { date: second, status: 'DRAFT' },
    ]);
    const before = await snapshot();
    // 2件目の通知で失敗させ、成功した1件目も残らないことを確かめる
    await env.DB.prepare(
      `CREATE TRIGGER test_fail_second_notification BEFORE INSERT ON notifications
       WHEN EXISTS (SELECT 1 FROM notifications)
       BEGIN SELECT RAISE(ABORT, 'test_notification_failure'); END`,
    ).run();
    try {
      const response = await put('shifts/publication', ctx.operator.token, body);

      expect(response.status).toBe(500);
      expect(await snapshot()).toEqual(before);
    } finally {
      await env.DB.prepare('DROP TRIGGER test_fail_second_notification').run();
    }
    // 対照: 同じ本文は、失敗要因がなければ公開と通知の両方が確定する
    expect((await put('shifts/publication', ctx.operator.token, body)).status).toBe(200);
    expect(await savedNotifications()).toHaveLength(2);
  });
});

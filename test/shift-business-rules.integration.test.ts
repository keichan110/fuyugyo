import { env } from 'cloudflare:test';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

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

/**
 * 手動割当・公開・勤務可否の業務ルールのうち、他のテストが扱わない境界を実 D1 で検証する。
 *
 * - 現状仕様の固定（C3・C4）: 保存 API が無効者・同日兼務を拒否しないことを、
 *   「禁止仕様ではない」現状の挙動として記録する。禁止へ変える場合は別設計で、このテストを更新する。
 * - 真の並行実行: `Promise.all` で複数リクエストを同時に走らせ、どの順で処理されても
 *   「全体成功か全体拒否」と DB の整合が保たれることを確認する。
 *   事前確認と書き込みの間へ必ず割り込ませる決定論的なテストは `shift-publication` 側にある。
 */

const db = createDb(env.DB);
const month = '2027-02';

type Token = string;

async function seedToken(role: 'MANAGER' | 'MEMBER', instructorId?: string): Promise<Token> {
  const [user] = await db
    .insert(users)
    .values({
      lineUserId: `line-${crypto.randomUUID()}`,
      displayName: role,
      role,
      isActive: true,
      instructorId,
    })
    .returning();
  if (!user) throw new Error('ユーザー作成失敗');
  return signJwt(
    { userId: user.id, displayName: role, role, isActive: true },
    env.JWT_SECRET,
    env.JWT_EXPIRES_IN,
  );
}

async function seedInstructor(
  lastName: string,
  status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
): Promise<string> {
  const [instructor] = await db
    .insert(instructors)
    .values({ lastName, firstName: '太郎', status })
    .returning();
  if (!instructor) throw new Error('インストラクター作成失敗');
  return instructor.id;
}

async function seedShiftType(name: string): Promise<string> {
  const [type] = await db.insert(shiftTypes).values({ name }).returning();
  if (!type) throw new Error('シフト種別作成失敗');
  await db.insert(departmentShiftTypes).values([
    { departmentCode: 'ski', shiftTypeId: type.id, sortOrder: 1 },
    { departmentCode: 'snowboard', shiftTypeId: type.id, sortOrder: 1 },
  ]);
  return type.id;
}

function put(path: string, token: Token, body: unknown) {
  return app.request(
    `/api/${path}`,
    {
      method: 'PUT',
      headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    env,
  );
}

function saveCell(
  token: Token,
  input: {
    departmentCode?: 'ski' | 'snowboard';
    shiftTypeId: string;
    date: string;
    instructorIds: string[];
    expectedRevision?: number | null;
  },
) {
  return put('shifts/assignments', token, {
    month,
    departmentCode: input.departmentCode ?? 'ski',
    cells: [
      {
        date: input.date,
        shiftTypeId: input.shiftTypeId,
        instructorIds: input.instructorIds,
        ...(input.expectedRevision === undefined
          ? {}
          : { expectedRevision: input.expectedRevision }),
      },
    ],
  });
}

async function assignmentsOf(shiftTypeId: string, date: string, departmentCode = 'ski') {
  const rows = await db
    .select({ instructorId: shiftAssignments.instructorId })
    .from(shiftAssignments)
    .innerJoin(shifts, eq(shifts.id, shiftAssignments.shiftId))
    .where(
      and(
        eq(shifts.date, new Date(`${date}T00:00:00.000Z`)),
        eq(shifts.shiftTypeId, shiftTypeId),
        eq(shifts.departmentCode, departmentCode),
      ),
    );
  return rows.map((row) => row.instructorId).sort();
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

describe('現状仕様の固定（C3・C4。禁止仕様ではなく、変更は別設計）', () => {
  it('C3: 無効（INACTIVE）のインストラクターも手動保存では割り当てられる', async () => {
    const manager = await seedToken('MANAGER');
    const typeId = await seedShiftType('一般');
    const inactive = await seedInstructor('無効', 'INACTIVE');
    const response = await saveCell(manager, {
      shiftTypeId: typeId,
      date: '2027-02-10',
      instructorIds: [inactive],
    });
    expect(response.status).toBe(200);
    expect(await assignmentsOf(typeId, '2027-02-10')).toEqual([inactive]);
  });

  it('C4: 同日の別シフト種別・別部門への重複割当は保存 API で拒否されない', async () => {
    const manager = await seedToken('MANAGER');
    const lesson = await seedShiftType('一般');
    const event = await seedShiftType('行事');
    const worker = await seedInstructor('兼務');
    const date = '2027-02-11';
    const results = [
      await saveCell(manager, { shiftTypeId: lesson, date, instructorIds: [worker] }),
    ];
    // 同じ部門の別種別、別部門の同種別は順に保存する（同じバッチで混ぜない）。
    results.push(await saveCell(manager, { shiftTypeId: event, date, instructorIds: [worker] }));
    results.push(
      await saveCell(manager, {
        departmentCode: 'snowboard',
        shiftTypeId: lesson,
        date,
        instructorIds: [worker],
      }),
    );
    expect(results.map((response) => response.status)).toEqual([200, 200, 200]);
    const rows = await db
      .select()
      .from(shiftAssignments)
      .where(eq(shiftAssignments.instructorId, worker));
    expect(rows).toHaveLength(3);
  });
});

describe('同じ内容の再保存', () => {
  it('配置と備考を変えず、更新世代だけが1進む', async () => {
    const manager = await seedToken('MANAGER');
    const typeId = await seedShiftType('一般');
    const worker = await seedInstructor('再保存');
    const date = '2027-02-12';
    expect(
      (await saveCell(manager, { shiftTypeId: typeId, date, instructorIds: [worker] })).status,
    ).toBe(200);
    const [before] = await db.select().from(shifts);
    if (!before) throw new Error('枠が作られていません');
    const again = await saveCell(manager, {
      shiftTypeId: typeId,
      date,
      instructorIds: [worker],
      expectedRevision: before.revision,
    });
    expect(again.status).toBe(200);
    const [after] = await db.select().from(shifts);
    expect(after).toMatchObject({ id: before.id, status: 'DRAFT', revision: before.revision + 1 });
    expect(await assignmentsOf(typeId, date)).toEqual([worker]);
  });
});

describe('真の並行実行（Promise.all で同時に処理するリクエスト）', () => {
  it('同じ新規枠への同時保存は、片方だけが成功し、配置は成功した側の内容だけになる', async () => {
    const manager = await seedToken('MANAGER');
    const typeId = await seedShiftType('一般');
    const first = await seedInstructor('甲');
    const second = await seedInstructor('乙');
    const date = '2027-02-13';
    const responses = await Promise.all([
      saveCell(manager, {
        shiftTypeId: typeId,
        date,
        instructorIds: [first],
        expectedRevision: null,
      }),
      saveCell(manager, {
        shiftTypeId: typeId,
        date,
        instructorIds: [second],
        expectedRevision: null,
      }),
    ]);
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 409]);
    const winner = responses[0]?.status === 200 ? first : second;
    expect(await db.select().from(shifts)).toHaveLength(1);
    // 敗者の配置が混ざらず、勝者の配置だけが残る。
    expect(await assignmentsOf(typeId, date)).toEqual([winner]);
  });

  it.each([0, 1, 2, 3, 4])(
    '公開と本人の勤務不可申告が同時に来ても、両方は成功しない（試行 %i）',
    async (offset) => {
      const manager = await seedToken('MANAGER');
      const typeId = await seedShiftType('一般');
      const worker = await seedInstructor('同時');
      const member = await seedToken('MEMBER', worker);
      const date = `2027-02-${String(14 + offset).padStart(2, '0')}`;
      expect(
        (await saveCell(manager, { shiftTypeId: typeId, date, instructorIds: [worker] })).status,
      ).toBe(200);
      const [saved] = await db
        .select()
        .from(shifts)
        .where(eq(shifts.date, new Date(`${date}T00:00:00.000Z`)));
      if (!saved) throw new Error('枠が作られていません');

      const responses = await Promise.all([
        put('shifts/publication', manager, {
          month,
          departmentCode: 'ski',
          shiftTypeId: typeId,
          status: 'PUBLISHED',
          dates: [{ date, expectedRevision: saved.revision, expectedShiftId: saved.id }],
        }),
        put('availabilities/me', member, { changes: [{ date, type: 'UNAVAILABLE' }] }),
      ]);
      const statuses = responses.map((response) => response.status).sort();
      expect(statuses).toEqual([200, 409]);

      // どちらが先でも、公開済みの人に勤務不可が残る状態にはならない。
      const [after] = await db.select().from(shifts).where(eq(shifts.id, saved.id));
      const unavailable = await db
        .select()
        .from(instructorAvailabilities)
        .where(
          and(
            eq(instructorAvailabilities.instructorId, worker),
            eq(instructorAvailabilities.type, 'UNAVAILABLE'),
          ),
        );
      expect(after?.status === 'PUBLISHED' && unavailable.length > 0).toBe(false);
      expect(after?.status === 'PUBLISHED' || unavailable.length === 1).toBe(true);
      // 配置は公開の成否に関係なく保たれる。
      expect(await assignmentsOf(typeId, date)).toEqual([worker]);
    },
  );
});

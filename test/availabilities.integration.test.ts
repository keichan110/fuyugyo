import { env } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  availabilityListResponseSchema,
  availabilityListSchema,
} from '../src/features/availabilities/schema';
import app from '../src/index';
import { signJwt } from '../src/server/auth/jwt';
import { createDb } from '../src/server/db/client';
import {
  instructorAvailabilities,
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

function authHeader(token: string): RequestInit {
  return { headers: { cookie: `auth-token=${token}`, 'Content-Type': 'application/json' } };
}

function authJsonRequest(token: string, body: unknown): RequestInit {
  return { ...authHeader(token), body: JSON.stringify(body) };
}

function dateOffset(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function seedInstructor(): Promise<string> {
  const [instructor] = await createDb(env.DB)
    .insert(instructors)
    .values({ lastName: '山田', firstName: '太郎', status: 'ACTIVE' })
    .returning();
  if (!instructor) throw new Error('インストラクター作成失敗');
  return instructor.id;
}

async function seedToken(
  role: 'ADMIN' | 'MANAGER' | 'MEMBER',
  instructorId?: string,
): Promise<string> {
  const [user] = await createDb(env.DB)
    .insert(users)
    .values({
      lineUserId: `line-${crypto.randomUUID()}`,
      displayName: `テスト${role}`,
      role,
      isActive: true,
      instructorId,
    })
    .returning();
  if (!user) throw new Error('ユーザー作成失敗');
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

async function assignInstructor(instructorId: string, date: string): Promise<void> {
  const db = createDb(env.DB);
  const [shiftType] = await db.insert(shiftTypes).values({ name: crypto.randomUUID() }).returning();
  if (!shiftType) throw new Error('シフト種別作成失敗');
  const [shift] = await db
    .insert(shifts)
    .values({
      date: new Date(`${date}T00:00:00.000Z`),
      departmentCode: 'ski',
      shiftTypeId: shiftType.id,
    })
    .returning();
  if (!shift) throw new Error('シフト作成失敗');
  await db.insert(shiftAssignments).values({ shiftId: shift.id, instructorId });
}

beforeEach(async () => {
  const db = createDb(env.DB);
  await db.delete(instructorAvailabilities);
  await db.delete(shiftAssignments);
  await db.delete(shifts);
  await db.delete(shiftTypes);
  await db.delete(users);
  await db.delete(instructors);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PUT /api/availabilities/me', () => {
  it('本人の申告を差分で原子的に作成・更新・削除する', async () => {
    const instructorId = await seedInstructor();
    const token = await seedToken('MEMBER', instructorId);
    const firstDate = dateOffset(3);
    const secondDate = dateOffset(4);

    const create = await app.request(
      '/api/availabilities/me',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          changes: [
            { date: firstDate, type: 'UNAVAILABLE', note: '私用' },
            { date: secondDate, type: 'AVOID' },
          ],
        }),
      },
      envWith({}),
    );
    expect(create.status).toBe(200);

    const update = await app.request(
      '/api/availabilities/me',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          changes: [
            { date: firstDate, type: 'AVOID', note: '午後なら可' },
            { date: secondDate, type: null },
          ],
        }),
      },
      envWith({}),
    );
    expect(update.status).toBe(200);

    const list = await app.request(
      `/api/availabilities/me?from=${firstDate}&to=${secondDate}`,
      authHeader(token),
      envWith({}),
    );
    expect(list.status).toBe(200);
    const body = availabilityListResponseSchema.parse(await list.json());
    expect(body.availabilities).toEqual([
      { instructorId, date: firstDate, type: 'AVOID', note: '午後なら可' },
    ]);
  });

  it('過去日と本人の割当済み日は拒否し、書き込みを残さない', async () => {
    const instructorId = await seedInstructor();
    const token = await seedToken('MEMBER', instructorId);
    const lockedDate = dateOffset(5);
    await assignInstructor(instructorId, lockedDate);

    const past = await app.request(
      '/api/availabilities/me',
      {
        method: 'PUT',
        ...authJsonRequest(token, { changes: [{ date: dateOffset(-1), type: 'AVOID' }] }),
      },
      envWith({}),
    );
    expect(past.status).toBe(400);

    const locked = await app.request(
      '/api/availabilities/me',
      {
        method: 'PUT',
        ...authJsonRequest(token, { changes: [{ date: lockedDate, type: 'UNAVAILABLE' }] }),
      },
      envWith({}),
    );
    expect(locked.status).toBe(409);

    const rows = await createDb(env.DB).select().from(instructorAvailabilities);
    expect(rows).toHaveLength(0);
  });

  it('UTC 15時を境に日本時間の前日を過去日として拒否する', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-17T14:59:59.999Z'));
    const instructorId = await seedInstructor();
    const token = await seedToken('MEMBER', instructorId);

    const beforeMidnight = await app.request(
      '/api/availabilities/me',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          changes: [{ date: '2026-07-17', type: 'AVOID' }],
        }),
      },
      envWith({}),
    );
    expect(beforeMidnight.status).toBe(200);

    vi.setSystemTime(new Date('2026-07-17T15:00:00.000Z'));
    const atMidnight = await app.request(
      '/api/availabilities/me',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          changes: [{ date: '2026-07-17', type: 'UNAVAILABLE' }],
        }),
      },
      envWith({}),
    );
    expect(atMidnight.status).toBe(400);
  });

  it('ボディの instructorId を無視し、JWT に紐づく本人だけを更新する', async () => {
    const instructorId = await seedInstructor();
    const otherInstructorId = await seedInstructor();
    const token = await seedToken('MEMBER', instructorId);
    const date = dateOffset(3);

    const res = await app.request(
      '/api/availabilities/me',
      {
        method: 'PUT',
        ...authJsonRequest(token, {
          instructorId: otherInstructorId,
          changes: [{ date, type: 'UNAVAILABLE' }],
        }),
      },
      envWith({}),
    );
    expect(res.status).toBe(200);

    const rows = await createDb(env.DB).select().from(instructorAvailabilities);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.instructorId).toBe(instructorId);
  });
});

describe('GET /api/availabilities', () => {
  it('本人取得には lockedDates を含め、管理者は全員分を閲覧できる', async () => {
    const instructorId = await seedInstructor();
    const otherInstructorId = await seedInstructor();
    const memberToken = await seedToken('MEMBER', instructorId);
    const managerToken = await seedToken('MANAGER');
    const date = dateOffset(3);
    const lockedDate = dateOffset(4);
    await createDb(env.DB)
      .insert(instructorAvailabilities)
      .values({
        instructorId,
        date: new Date(`${date}T00:00:00.000Z`),
        type: 'UNAVAILABLE',
        note: null,
      });
    await createDb(env.DB)
      .insert(instructorAvailabilities)
      .values({
        instructorId: otherInstructorId,
        date: new Date(`${date}T00:00:00.000Z`),
        type: 'AVOID',
        note: '別の人',
      });
    await assignInstructor(instructorId, lockedDate);

    const me = await app.request(
      `/api/availabilities/me?from=${date}&to=${lockedDate}`,
      authHeader(memberToken),
      envWith({}),
    );
    expect(me.status).toBe(200);
    const mine = availabilityListResponseSchema.parse(await me.json());
    expect(mine.availabilities).toEqual([{ instructorId, date, type: 'UNAVAILABLE', note: null }]);
    expect(mine.lockedDates).toEqual([lockedDate]);

    const all = await app.request(
      `/api/availabilities?from=${date}&to=${lockedDate}`,
      authHeader(managerToken),
      envWith({}),
    );
    expect(all.status).toBe(200);
    expect(availabilityListSchema.parse(await all.json())).toHaveLength(2);

    const filtered = await app.request(
      `/api/availabilities?from=${date}&to=${lockedDate}&instructorId=${otherInstructorId}`,
      authHeader(managerToken),
      envWith({}),
    );
    expect(filtered.status).toBe(200);
    expect(availabilityListSchema.parse(await filtered.json())).toEqual([
      { instructorId: otherInstructorId, date, type: 'AVOID', note: '別の人' },
    ]);
  });

  it('MEMBER の全員閲覧とインストラクター未連携の本人操作を拒否する', async () => {
    const instructorId = await seedInstructor();
    const memberToken = await seedToken('MEMBER', instructorId);
    const unlinkedToken = await seedToken('MEMBER');
    const date = dateOffset(3);

    const all = await app.request(
      `/api/availabilities?from=${date}&to=${date}`,
      authHeader(memberToken),
      envWith({}),
    );
    expect(all.status).toBe(403);

    const me = await app.request(
      `/api/availabilities/me?from=${date}&to=${date}`,
      authHeader(unlinkedToken),
      envWith({}),
    );
    expect(me.status).toBe(403);
  });
});

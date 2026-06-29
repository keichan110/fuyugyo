import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';
import { type AuthVariables, requireAuth, requireRole } from '@/server/middleware/auth';
import { createDb } from '@/server/db/client';
import { instructors, users } from '@/server/db/schema';
import type { Env } from '@/server/types';
import { changeRoleSchema, linkInstructorSchema } from './schema';

/** SQLite UNIQUE 制約違反かどうかを判定する */
function isUniqueViolation(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e.message.includes('UNIQUE constraint failed')) return true;
  if (e.cause instanceof Error && e.cause.message.includes('UNIQUE constraint failed')) return true;
  return false;
}

type Db = ReturnType<typeof createDb>;

/**
 * isActive フラグを更新する共通ヘルパー（deactivate/activate で使用）。
 * 存在確認 → update → returning を一本化し DRY を守る。
 */
async function setUserActive(db: Db, id: string, isActive: boolean) {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  const [updated] = await db
    .update(users)
    .set({ isActive })
    .where(eq(users.id, id))
    .returning();

  if (!updated) {
    throw new HTTPException(500, {
      message: `Failed to ${isActive ? 'activate' : 'deactivate'} user`,
    });
  }
  return updated;
}

/**
 * User 管理の Hono ルート（ADR 0005）。
 * 一覧・ロール変更・無効化・Instructor リンクを提供する。
 * 書き込み系（ロール変更・無効化・リンク操作）は ADMIN のみ。
 */
export const usersRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>()
  /** ユーザー一覧を返す（ADMIN のみ）。ロール・isActive を含む全フィールドを返す */
  .get('/', requireAuth, requireRole('ADMIN'), async (c) => {
    const db = createDb(c.env.DB);
    const rows = await db.select().from(users);
    return c.json(rows);
  })
  /** ユーザーを1件取得する（ADMIN のみ） */
  .get('/:id', requireAuth, requireRole('ADMIN'), async (c) => {
    const db = createDb(c.env.DB);
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, c.req.param('id')))
      .limit(1);

    if (!row) {
      throw new HTTPException(404, { message: 'User not found' });
    }
    return c.json(row);
  })
  /** ロールを変更する（ADMIN のみ・自己変更は禁止） */
  .post(
    '/:id/change-role',
    requireAuth,
    requireRole('ADMIN'),
    validator('json', (value, c) => {
      const parsed = changeRoleSchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const input = c.req.valid('json');
      const db = createDb(c.env.DB);
      const id = c.req.param('id');

      // 自分自身のロール変更は ADMIN 不在状態になりうるため禁止する
      if (id === c.get('user').userId) {
        throw new HTTPException(400, { message: 'Cannot change your own role' });
      }

      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!existing) {
        throw new HTTPException(404, { message: 'User not found' });
      }

      const [updated] = await db
        .update(users)
        .set({ role: input.role })
        .where(eq(users.id, id))
        .returning();

      if (!updated) {
        throw new HTTPException(500, { message: 'Failed to change role' });
      }
      return c.json(updated);
    }
  )
  /**
   * ユーザーを無効化する（isActive=false）（ADMIN のみ・自己無効化は禁止）。
   * 物理削除は行わず論理削除とする。
   */
  .post('/:id/deactivate', requireAuth, requireRole('ADMIN'), async (c) => {
    const id = c.req.param('id');

    // 自分自身の無効化は管理者不在状態を引き起こすため禁止する
    if (id === c.get('user').userId) {
      throw new HTTPException(400, { message: 'Cannot deactivate yourself' });
    }

    return c.json(await setUserActive(createDb(c.env.DB), id, false));
  })
  /** ユーザーをアクティブ化する（ADMIN のみ） */
  .post('/:id/activate', requireAuth, requireRole('ADMIN'), async (c) => {
    return c.json(await setUserActive(createDb(c.env.DB), c.req.param('id'), true));
  })
  /**
   * User を Instructor にリンクする（ADMIN のみ）。
   * `users.instructor_id` に UNIQUE 制約があるため、1 Instructor に複数 User をリンクしようとすると
   * DB レベルで弾かれる（SQLite では NULL は UNIQUE 制約の対象外）。
   */
  .post(
    '/:id/link-instructor',
    requireAuth,
    requireRole('ADMIN'),
    validator('json', (value, c) => {
      const parsed = linkInstructorSchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const input = c.req.valid('json');
      const db = createDb(c.env.DB);
      const id = c.req.param('id');

      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!user) {
        throw new HTTPException(404, { message: 'User not found' });
      }

      const [instructor] = await db
        .select({ id: instructors.id })
        .from(instructors)
        .where(eq(instructors.id, input.instructorId))
        .limit(1);

      if (!instructor) {
        throw new HTTPException(404, { message: 'Instructor not found' });
      }

      try {
        const [updated] = await db
          .update(users)
          .set({ instructorId: input.instructorId })
          .where(eq(users.id, id))
          .returning();

        if (!updated) {
          throw new HTTPException(500, { message: 'Failed to link instructor' });
        }
        return c.json(updated);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new HTTPException(409, {
            message: 'This instructor is already linked to another user',
          });
        }
        throw err;
      }
    }
  )
  /** User から Instructor リンクを解除する（ADMIN のみ） */
  .delete('/:id/link-instructor', requireAuth, requireRole('ADMIN'), async (c) => {
    const db = createDb(c.env.DB);
    const id = c.req.param('id');

    const [existing] = await db
      .select({ id: users.id, instructorId: users.instructorId })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!existing) {
      throw new HTTPException(404, { message: 'User not found' });
    }

    if (existing.instructorId === null) {
      throw new HTTPException(409, { message: 'User is not linked to any instructor' });
    }

    const [updated] = await db
      .update(users)
      .set({ instructorId: null })
      .where(eq(users.id, id))
      .returning();

    if (!updated) {
      throw new HTTPException(500, { message: 'Failed to unlink instructor' });
    }
    return c.json(updated);
  });

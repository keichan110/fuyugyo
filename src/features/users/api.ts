import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';

import { type UserRole } from '@/server/auth/jwt';
import { toUserRole } from '@/server/auth/user';
import { createDb } from '@/server/db/client';
import { isUniqueViolation } from '@/server/db/errors';
import { instructors, users } from '@/server/db/schema';
import { assignInstructorRichMenu, unlinkUserRichMenu } from '@/server/line/rich-menu';
import { requireAuth, requireRole, type AuthVariables } from '@/server/middleware/auth';
import type { Env } from '@/server/types';

import { changeRoleSchema, linkInstructorSchema } from './schema';
import { canChangeUserStatus } from './status-policy';

type Db = ReturnType<typeof createDb>;

/**
 * API で返す User のカラム。
 * `lineUserId` はログイン時のユーザー特定にのみ使う識別子のため、レスポンスには含めない。
 * `users` にカラムを追加して API で返す場合は、ここと `userSchema` の両方を更新する。
 */
const userColumns = {
  id: users.id,
  displayName: users.displayName,
  pictureUrl: users.pictureUrl,
  role: users.role,
  isActive: users.isActive,
  instructorId: users.instructorId,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

/**
 * isActive フラグを更新する共通ヘルパー（deactivate/activate で使用）。
 * 存在確認 → 権限判定 → update → returning を一本化し DRY を守る。
 * 操作者が MANAGER の場合は、対象ロールが MEMBER のときだけ変更できる（ADMIN は全員可）。
 */
async function setUserActive(db: Db, id: string, isActive: boolean, actorRole: UserRole) {
  const [existing] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  if (!canChangeUserStatus(actorRole, toUserRole(existing.role))) {
    throw new HTTPException(403, { message: 'Forbidden' });
  }

  const [updated] = await db
    .update(users)
    .set({ isActive })
    .where(eq(users.id, id))
    .returning(userColumns);

  if (!updated) {
    throw new HTTPException(500, {
      message: `Failed to ${isActive ? 'activate' : 'deactivate'} user`,
    });
  }
  return updated;
}

/**
 * User 管理の Hono ルート。
 * 一覧・ロール変更・無効化・Instructor リンクを提供する。
 * ロール変更は ADMIN のみ。一覧・取得・リンク操作は MANAGER 以上。
 * 有効化・無効化は MANAGER 以上だが、MANAGER は MEMBER のみを対象にできる。
 */
export const usersRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>()
  /** ユーザー一覧を返す（MANAGER 以上）。ロール・isActive を含む管理用フィールドを返す */
  .get('/', requireAuth, requireRole('MANAGER'), async (c) => {
    const db = createDb(c.env.DB);
    const rows = await db.select(userColumns).from(users);
    return c.json(rows);
  })
  /** ユーザーを1件取得する（MANAGER 以上） */
  .get('/:id', requireAuth, requireRole('MANAGER'), async (c) => {
    const db = createDb(c.env.DB);
    const [row] = await db
      .select(userColumns)
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
        .returning(userColumns);

      if (!updated) {
        throw new HTTPException(500, { message: 'Failed to change role' });
      }
      return c.json(updated);
    },
  )
  /**
   * ユーザーを無効化する（isActive=false）（MANAGER 以上・自己無効化は禁止）。
   * MANAGER は MEMBER のみ無効化できる。
   * 物理削除は行わず論理削除とする。
   */
  .post('/:id/deactivate', requireAuth, requireRole('MANAGER'), async (c) => {
    const id = c.req.param('id');

    // 自分自身の無効化は管理者不在状態を引き起こすため禁止する
    if (id === c.get('user').userId) {
      throw new HTTPException(400, { message: 'Cannot deactivate yourself' });
    }

    return c.json(await setUserActive(createDb(c.env.DB), id, false, c.get('user').role));
  })
  /** ユーザーをアクティブ化する（MANAGER 以上。MANAGER は MEMBER のみ対象） */
  .post('/:id/activate', requireAuth, requireRole('MANAGER'), async (c) => {
    return c.json(
      await setUserActive(createDb(c.env.DB), c.req.param('id'), true, c.get('user').role),
    );
  })
  /**
   * User を Instructor にリンクする（MANAGER 以上・対象ロールは問わない）。
   * `users.instructor_id` に UNIQUE 制約があるため、1 Instructor に複数 User をリンクしようとすると
   * DB レベルで弾かれる（SQLite では NULL は UNIQUE 制約の対象外）。
   * 未紐付けから紐付けた場合は LINE の個別リッチメニューを割り当てる。割り当ての失敗は応答に影響しない。
   */
  .post(
    '/:id/link-instructor',
    requireAuth,
    requireRole('MANAGER'),
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
        .select({ lineUserId: users.lineUserId })
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
        const change = { instructorId: input.instructorId };
        // 未紐付けからの遷移かは、並行した操作が割り込めないよう同じ batch の条件付き更新で確定する
        const [newlyLinked, [updated]] = await db.batch([
          db
            .update(users)
            .set(change)
            .where(and(eq(users.id, id), isNull(users.instructorId)))
            .returning({ id: users.id }),
          db.update(users).set(change).where(eq(users.id, id)).returning(userColumns),
        ]);

        if (!updated) {
          throw new HTTPException(500, { message: 'Failed to link instructor' });
        }
        // 付け替えは連携済みのままのため、メニューを変更しない
        if (newlyLinked.length > 0) {
          await assignInstructorRichMenu(c.env, user.lineUserId);
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
    },
  )
  /**
   * User から Instructor リンクを解除する（MANAGER 以上・対象ロールは問わない）。
   * 解除後は LINE の個別リッチメニューも解除する。LINE 側の失敗は応答に影響しない。
   */
  .delete('/:id/link-instructor', requireAuth, requireRole('MANAGER'), async (c) => {
    const db = createDb(c.env.DB);
    const id = c.req.param('id');

    const [existing] = await db
      .select({ lineUserId: users.lineUserId })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!existing) {
      throw new HTTPException(404, { message: 'User not found' });
    }

    // 紐付け済みであることを更新条件にし、並行した解除を二重に扱わない
    const [updated] = await db
      .update(users)
      .set({ instructorId: null })
      .where(and(eq(users.id, id), isNotNull(users.instructorId)))
      .returning(userColumns);

    if (!updated) {
      throw new HTTPException(409, { message: 'User is not linked to any instructor' });
    }
    await unlinkUserRichMenu(c.env, existing.lineUserId);
    return c.json(updated);
  });

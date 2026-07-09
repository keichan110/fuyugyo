import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';

import { durationToSeconds } from '@/server/auth/roles';
import { createDb } from '@/server/db/client';
import { invitationTokens } from '@/server/db/schema';
import { requireAuth, requireRole, type AuthVariables } from '@/server/middleware/auth';
import { rateLimit } from '@/server/middleware/rate-limit';
import type { Env } from '@/server/types';

import { createInvitationSchema } from './schema';

/**
 * Invitation 管理の Hono ルート（ADR 0005/0006）。
 * 作成・一覧・無効化は ADMIN/MANAGER のみ。
 * 検証エンドポイントは未認証で利用可能（Rate Limit 対象）。
 */
export const invitationsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>()
  /**
   * 招待トークンを作成する（ADMIN/MANAGER のみ）。
   * 既存のアクティブな招待を全て失効させ、新しい招待に置き換える（有効な招待は常に1件）。
   * expiresInHours 省略時は env.INVITE_DEFAULT_EXPIRES を使う。
   */
  .post(
    '/',
    requireAuth,
    requireRole('MANAGER'),
    validator('json', (value, c) => {
      const parsed = createInvitationSchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const input = c.req.valid('json');
      const db = createDb(c.env.DB);
      const { userId } = c.get('user');

      const expiresInSeconds = input.expiresInHours
        ? input.expiresInHours * 3600
        : durationToSeconds(c.env.INVITE_DEFAULT_EXPIRES);
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

      // 既存の isActive=true を全て失効させてから新規挿入する（有効な招待は常に1件）。
      // 期限切れだが isActive=true のまま残っている行も一括で対象になる。
      const [, insertedRows] = await db.batch([
        db
          .update(invitationTokens)
          .set({ isActive: false })
          .where(eq(invitationTokens.isActive, true)),
        db
          .insert(invitationTokens)
          .values({
            token: crypto.randomUUID(),
            expiresAt,
            createdBy: userId,
            maxUses: input.maxUses ?? null, // API互換のためフィールドは維持（UIからは送らない）
            description: input.description ?? null,
          })
          .returning(),
      ]);
      const created = insertedRows[0];

      if (!created) {
        throw new HTTPException(500, { message: 'Failed to create invitation' });
      }
      return c.json(created, 201);
    },
  )
  /** 招待トークン一覧を返す（ADMIN/MANAGER のみ）。アクティブ・失効済みを含む全件 */
  .get('/', requireAuth, requireRole('MANAGER'), async (c) => {
    const db = createDb(c.env.DB);
    const rows = await db.select().from(invitationTokens).orderBy(desc(invitationTokens.createdAt));
    return c.json(rows);
  })
  /**
   * 招待トークンを無効化する（ADMIN/MANAGER のみ）。
   * 物理削除は行わず isActive=false とする。
   * UPDATE の returning が空＝トークン不在として 404 を返す（SELECT+UPDATE の2往復を避ける）。
   */
  .post('/:token/deactivate', requireAuth, requireRole('MANAGER'), async (c) => {
    const db = createDb(c.env.DB);
    const token = c.req.param('token');

    const [updated] = await db
      .update(invitationTokens)
      .set({ isActive: false })
      .where(eq(invitationTokens.token, token))
      .returning();

    if (!updated) {
      throw new HTTPException(404, { message: 'Invitation not found' });
    }
    return c.json(updated);
  })
  /**
   * 招待トークンを検証する（未認証・Rate Limit 対象）。
   * 有効（アクティブ・期限内・使用上限未満）な場合のみ公開用の最小フィールドを返す。
   * 無効/期限切れ/使用上限超過は 4xx で弾く。
   * `createdBy` 等の内部フィールドは未認証エンドポイントでは返さない。
   */
  .get('/:token/verify', rateLimit('invitation-verify'), async (c) => {
    const db = createDb(c.env.DB);
    const token = c.req.param('token');

    const [invitation] = await db
      .select()
      .from(invitationTokens)
      .where(eq(invitationTokens.token, token))
      .limit(1);

    if (!invitation) {
      throw new HTTPException(404, { message: 'Invitation not found' });
    }
    if (!invitation.isActive) {
      throw new HTTPException(410, { message: 'Invitation is no longer active' });
    }
    if (invitation.expiresAt <= new Date()) {
      throw new HTTPException(410, { message: 'Invitation has expired' });
    }
    if (invitation.maxUses !== null && invitation.usedCount >= invitation.maxUses) {
      throw new HTTPException(422, { message: 'Invitation has reached its maximum uses' });
    }

    return c.json({
      token: invitation.token,
      expiresAt: invitation.expiresAt,
      description: invitation.description,
    });
  });

import { and, desc, eq, gt, gte, isNull, notExists, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { createDb } from '@/server/db/client';
import { invitationTokens, users } from '@/server/db/schema';
import { requireAuth, requireRole, type AuthVariables } from '@/server/middleware/auth';
import { rateLimit } from '@/server/middleware/rate-limit';
import type { Env } from '@/server/types';

import { INVITATION_REUSE_SECONDS, INVITATION_TTL_SECONDS } from './constants';

/**
 * Invitation 管理の Hono ルート。
 * 作成・一覧・停止は ADMIN のみ。
 * 検証エンドポイントは未認証で利用可能（Rate Limit 対象）。
 */
export const invitationsRoute = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>()
  /**
   * 招待リンクを発行する（ADMIN のみ・ボディ不要）。
   * 同じ ADMIN が1時間以内に発行した有効な24時間・無制限リンクがあれば最新の1件を 200 で返し、
   * なければ24時間・無制限の新規リンクを 201 で作る。既存リンクは停止しない。
   *
   * 並行発行でリンクが増えないよう、「候補がなければ挿入」する INSERT ... SELECT ... WHERE NOT EXISTS と
   * 候補の取得を同一 `db.batch`（D1 では単一トランザクション）で実行する。
   * 時刻は秒単位の同一値を使い、同じ秒の並びはトークンを副キーにして固定する。
   */
  .post('/', requireAuth, requireRole('ADMIN'), async (c) => {
    const db = createDb(c.env.DB);
    const { userId } = c.get('user');

    const nowSeconds = Math.floor(Date.now() / 1000);
    const now = new Date(nowSeconds * 1000);
    const reusableSince = new Date((nowSeconds - INVITATION_REUSE_SECONDS) * 1000);

    // 再利用できる候補: 自分が発行した有効な24時間・無制限リンクで、発行から1時間以内（ちょうど1時間を含む）
    const reusable = and(
      eq(invitationTokens.createdBy, userId),
      eq(invitationTokens.isActive, true),
      isNull(invitationTokens.maxUses),
      gt(invitationTokens.expiresAt, now),
      gte(invitationTokens.createdAt, reusableSince),
      sql`${invitationTokens.expiresAt} - ${invitationTokens.createdAt} = ${INVITATION_TTL_SECONDS}`,
    );

    // INSERT ... SELECT は Drizzle が列順の完全一致を要求するため全列を明示する
    const [inserted, candidates] = await db.batch([
      db
        .insert(invitationTokens)
        .select(
          db
            .select({
              token: sql<string>`${crypto.randomUUID()}`.as('token'),
              expiresAt: sql<Date>`${nowSeconds + INVITATION_TTL_SECONDS}`.as('expires_at'),
              isActive: sql<boolean>`1`.as('is_active'),
              createdBy: sql<string>`${userId}`.as('created_by'),
              maxUses: sql<number | null>`NULL`.as('max_uses'),
              usedCount: sql<number>`0`.as('used_count'),
              description: sql<string | null>`NULL`.as('description'),
              createdAt: sql<Date>`${nowSeconds}`.as('created_at'),
              updatedAt: sql<Date>`${nowSeconds}`.as('updated_at'),
            })
            // 1 行だけ返すダミーの FROM に、候補がないときだけ行が残る条件を付ける
            .from(sql`(SELECT 1) AS seed`)
            .where(
              notExists(
                db
                  .select({ one: sql`1` })
                  .from(invitationTokens)
                  .where(reusable),
              ),
            ),
        )
        .returning(),
      db
        .select()
        .from(invitationTokens)
        .where(reusable)
        .orderBy(desc(invitationTokens.createdAt), desc(invitationTokens.token))
        .limit(1),
    ]);

    const created = inserted[0];
    if (created) {
      return c.json(created, 201);
    }
    const reused = candidates[0];
    if (!reused) {
      throw new HTTPException(500, { message: 'Failed to create invitation' });
    }
    return c.json(reused, 200);
  })
  /**
   * 有効な招待リンク一覧を返す（ADMIN のみ）。期限内・停止されていない・使用上限未到達のものを新しい順に返す。
   * 作成者名は users との LEFT JOIN で取得し、削除済みの作成者は null。
   */
  .get('/', requireAuth, requireRole('ADMIN'), async (c) => {
    const db = createDb(c.env.DB);
    const rows = await db
      .select({
        token: invitationTokens.token,
        expiresAt: invitationTokens.expiresAt,
        isActive: invitationTokens.isActive,
        createdBy: invitationTokens.createdBy,
        createdByName: users.displayName,
        maxUses: invitationTokens.maxUses,
        usedCount: invitationTokens.usedCount,
        description: invitationTokens.description,
        createdAt: invitationTokens.createdAt,
        updatedAt: invitationTokens.updatedAt,
      })
      .from(invitationTokens)
      .leftJoin(users, eq(users.id, invitationTokens.createdBy))
      .where(
        and(
          eq(invitationTokens.isActive, true),
          gt(invitationTokens.expiresAt, new Date()),
          or(
            isNull(invitationTokens.maxUses),
            gt(invitationTokens.maxUses, invitationTokens.usedCount),
          ),
        ),
      )
      .orderBy(desc(invitationTokens.createdAt), desc(invitationTokens.token));
    return c.json(rows);
  })
  /**
   * 招待リンクを停止する（ADMIN のみ）。
   * 物理削除は行わず isActive=false とする。
   * UPDATE の returning が空＝トークン不在として 404 を返す（SELECT+UPDATE の2往復を避ける）。
   */
  .post('/:token/deactivate', requireAuth, requireRole('ADMIN'), async (c) => {
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

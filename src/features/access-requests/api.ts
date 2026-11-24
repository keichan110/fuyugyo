import { and, desc, eq, exists, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { validator } from 'hono/validator';

import { verifyAccessRequestToken } from '@/server/auth/access-request-token';
import {
  ACCESS_REQUEST_COOKIE,
  ACCESS_REQUEST_COOKIE_PATH,
  ACCESS_REQUEST_FLOW_COOKIE,
  ACCESS_REQUEST_FLOW_COOKIE_PATH,
} from '@/server/auth/cookies';
import { createDb, type Database } from '@/server/db/client';
import { isUniqueViolation } from '@/server/db/errors';
import { accessRequests, instructors, users } from '@/server/db/schema';
import { requireAuth, requireRole, type AuthVariables } from '@/server/middleware/auth';
import { rateLimit } from '@/server/middleware/rate-limit';
import type { Env } from '@/server/types';

import { ACCESS_REQUEST_LIMIT, accessRequestCutoff } from './constants';
import { approveAccessRequestSchema, rejectBatchSchema } from './schema';

/** 接続元から推定された地域情報。取得できない項目は null */
type RequestLocation = {
  country: string | null;
  region: string | null;
  city: string | null;
};

/** オブジェクトから文字列のプロパティだけを取り出す。文字列でなければ null */
function pickString(source: object, key: string): string | null {
  const value: unknown = Reflect.get(source, key);
  return typeof value === 'string' ? value : null;
}

/**
 * Cloudflare が付与する `request.cf` から地域情報を読む。
 * ローカル開発など `cf` がない環境や、項目が文字列でない場合は null にする。
 */
function readLocation(request: Request): RequestLocation {
  const cf: unknown = Reflect.get(request, 'cf');
  if (typeof cf !== 'object' || cf === null) {
    return { country: null, region: null, city: null };
  }
  return {
    country: pickString(cf, 'country'),
    region: pickString(cf, 'region'),
    city: pickString(cf, 'city'),
  };
}

/**
 * 期限切れ（`requested_at` が有効期限の境界より前）の申請を削除するクエリを組み立てる。
 * 実行はしない。申請 API の `db.batch` に含めるために使う。
 *
 * @param db - Drizzle クライアント
 * @param now - 基準時刻
 */
function expiredAccessRequestsDeletion(db: Database, now: Date) {
  return db.delete(accessRequests).where(lt(accessRequests.requestedAt, accessRequestCutoff(now)));
}

/**
 * 期限切れの申請を削除する。Cron から定期的に呼び、申請がない期間でも
 * LINE アカウント情報・地域情報が期限後に残らないようにする。
 *
 * @param db - Drizzle クライアント
 * @param now - 基準時刻
 */
export async function deleteExpiredAccessRequests(db: Database, now: Date): Promise<void> {
  await expiredAccessRequestsDeletion(db, now);
}

/** 管理 API が返す申請の公開列。`lineUserId` は管理画面にも公開しない */
const pendingColumns = {
  id: accessRequests.id,
  displayName: accessRequests.displayName,
  pictureUrl: accessRequests.pictureUrl,
  country: accessRequests.country,
  region: accessRequests.region,
  city: accessRequests.city,
  requestedAt: accessRequests.requestedAt,
};

/** FK 制約違反（存在しない Instructor の指定）かどうかを判定する */
function isForeignKeyViolation(e: unknown): boolean {
  if (!(e instanceof Error)) {
    return false;
  }
  return (
    e.message.includes('FOREIGN KEY constraint failed') ||
    (e.cause instanceof Error && e.cause.message.includes('FOREIGN KEY constraint failed'))
  );
}

/**
 * 利用申請の Hono ルート。
 * 未登録の LINE ユーザーが、callback で発行された申請 Cookie を持って申請する（未認証のため Rate Limit を適用）。
 * 承認待ち一覧・承認・却下は ADMIN 専用で、認証済み API のため Rate Limit は適用しない。
 * 管理操作は ACCESS_REQUESTS_ENABLED（新規申請の受付フラグ）に連動させない。
 */
export const accessRequestsRoute = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
  /** 期限内かつ未登録の申請を、申請日時の新しい順に返す（ADMIN のみ） */
  .get('/', requireAuth, requireRole('ADMIN'), async (c) => {
    const db = createDb(c.env.DB);
    const rows = await db
      .select(pendingColumns)
      .from(accessRequests)
      .where(
        and(
          gte(accessRequests.requestedAt, accessRequestCutoff(new Date())),
          sql`NOT EXISTS (SELECT 1 FROM ${users} WHERE ${eq(users.lineUserId, accessRequests.lineUserId)})`,
        ),
      )
      .orderBy(desc(accessRequests.requestedAt));
    return c.json(rows);
  })
  /**
   * 利用申請を受け付ける。
   * 申請の作成・更新は単一の `db.batch` で原子的に行い、上限判定を DB 側の条件に閉じ込める。
   */
  .post('/', rateLimit('access-request'), async (c) => {
    if (c.env.ACCESS_REQUESTS_ENABLED !== 'true') {
      throw new HTTPException(403, { message: 'Access requests are closed' });
    }

    const token = getCookie(c, ACCESS_REQUEST_COOKIE);
    const profile = token ? await verifyAccessRequestToken(token, c.env.JWT_SECRET) : null;
    // 申請トークンのフロー識別子が現在のフロー Cookie と一致しなければ無効扱いにする。
    // ログアウトや次の OAuth 開始でフロー Cookie が変わると、古いトークンでは申請できない
    const flow = getCookie(c, ACCESS_REQUEST_FLOW_COOKIE);
    if (!profile || !profile.flow || profile.flow !== flow) {
      throw new HTTPException(401, { message: 'Access request session is invalid' });
    }

    const db = createDb(c.env.DB);
    const now = new Date();
    const location = readLocation(c.req.raw);
    const pictureUrl = profile.pictureUrl ?? null;

    // 1. 期限切れの申請を削除する（件数にも含めない）
    // 2. 「未登録」かつ「自分以外の申請が上限未満、または自分の申請が既にある」場合に限り upsert する。
    //    登録済み判定を upsert と同じ文に含めることで、承認（User 作成）と競合しても
    //    承認済みアカウントの申請が再作成されないようにする。
    //    条件を満たさなければ 0 行になり、原因は後で users を照会して切り分ける
    const [, upserted] = await db.batch([
      expiredAccessRequestsDeletion(db, now),
      db
        .insert(accessRequests)
        .select(
          db
            .select({
              id: sql<string>`${crypto.randomUUID()}`.as('id'),
              lineUserId: sql<string>`${profile.userId}`.as('line_user_id'),
              displayName: sql<string>`${profile.displayName}`.as('display_name'),
              pictureUrl: sql<string | null>`${pictureUrl}`.as('picture_url'),
              country: sql<string | null>`${location.country}`.as('country'),
              region: sql<string | null>`${location.region}`.as('region'),
              city: sql<string | null>`${location.city}`.as('city'),
              requestedAt: sql<Date>`${Math.floor(now.getTime() / 1000)}`.as('requested_at'),
            })
            .from(sql`(SELECT 1)`)
            .where(
              sql`((SELECT count(*) FROM ${accessRequests} WHERE ${ne(accessRequests.lineUserId, profile.userId)}) < ${ACCESS_REQUEST_LIMIT}
                OR EXISTS (SELECT 1 FROM ${accessRequests} WHERE ${eq(accessRequests.lineUserId, profile.userId)}))
                AND NOT EXISTS (SELECT 1 FROM ${users} WHERE ${eq(users.lineUserId, profile.userId)})`,
            ),
        )
        .onConflictDoUpdate({
          target: accessRequests.lineUserId,
          set: {
            displayName: profile.displayName,
            pictureUrl,
            country: location.country,
            region: location.region,
            city: location.city,
            requestedAt: now,
          },
        })
        .returning({ requestedAt: accessRequests.requestedAt }),
    ]);

    const [row] = upserted;
    if (!row) {
      // 0 行の原因が登録済みか上限到達かを切り分ける
      const [registered] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.lineUserId, profile.userId))
        .limit(1);
      if (registered) {
        throw new HTTPException(409, { message: 'Already registered' });
      }
      throw new HTTPException(403, { message: 'Access request limit reached' });
    }

    deleteCookie(c, ACCESS_REQUEST_COOKIE, { path: ACCESS_REQUEST_COOKIE_PATH });
    deleteCookie(c, ACCESS_REQUEST_FLOW_COOKIE, { path: ACCESS_REQUEST_FLOW_COOKIE_PATH });
    return c.json({ requestedAt: row.requestedAt.toISOString() }, 201);
  })
  /**
   * 申請を承認し、有効な MEMBER を作成する（ADMIN のみ）。インストラクターは任意で同時に紐付ける。
   * ユーザー作成と申請削除は単一の `db.batch` で原子的に行う。申請の期限・未登録の判定と
   * 削除の条件（今回生成したユーザー ID の作成成功）を SQL に閉じ込め、二重承認や却下との
   * 競合で別アカウントの作成・申請だけの消失が起きないようにする。
   * 競合を無視するのは LINE ID の重複のみで、既存ユーザーのロール・紐付けは上書きしない。
   */
  .post(
    '/:id/approve',
    requireAuth,
    requireRole('ADMIN'),
    validator('json', (value, c) => {
      const parsed = approveAccessRequestSchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const { instructorId } = c.req.valid('json');
      const id = c.req.param('id');
      const db = createDb(c.env.DB);
      const now = new Date();

      // 存在確認はエラー表示のための補助。整合性は下の SQL 条件と DB 制約で守る
      if (instructorId !== undefined) {
        const [instructor] = await db
          .select({ id: instructors.id })
          .from(instructors)
          .where(eq(instructors.id, instructorId))
          .limit(1);
        if (!instructor) {
          throw new HTTPException(404, { message: 'Instructor not found' });
        }
      }

      const userId = crypto.randomUUID();
      const nowSeconds = Math.floor(now.getTime() / 1000);
      let deleted: Array<{ id: string }>;
      try {
        const [, result] = await db.batch([
          db
            .insert(users)
            .select(
              db
                .select({
                  id: sql<string>`${userId}`.as('id'),
                  lineUserId: accessRequests.lineUserId,
                  displayName: accessRequests.displayName,
                  pictureUrl: accessRequests.pictureUrl,
                  role: sql<string>`'MEMBER'`.as('role'),
                  isActive: sql<boolean>`1`.as('is_active'),
                  instructorId: sql<string | null>`${instructorId ?? null}`.as('instructor_id'),
                  createdAt: sql<Date>`${nowSeconds}`.as('created_at'),
                  updatedAt: sql<Date>`${nowSeconds}`.as('updated_at'),
                })
                .from(accessRequests)
                .where(
                  and(
                    eq(accessRequests.id, id),
                    gte(accessRequests.requestedAt, accessRequestCutoff(now)),
                  ),
                ),
            )
            .onConflictDoNothing({ target: users.lineUserId }),
          db
            .delete(accessRequests)
            .where(
              and(
                eq(accessRequests.id, id),
                exists(
                  db
                    .select({ one: sql`1` })
                    .from(users)
                    .where(eq(users.id, userId)),
                ),
              ),
            )
            .returning({ id: accessRequests.id }),
        ]);
        deleted = result;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new HTTPException(409, {
            message: 'This instructor is already linked to another user',
          });
        }
        if (isForeignKeyViolation(err)) {
          throw new HTTPException(404, { message: 'Instructor not found' });
        }
        throw err;
      }

      if (deleted.length === 0) {
        // ユーザーが作られなかった原因を切り分ける（申請なし・期限切れは 404、登録済みは 409）
        const [registered] = await db
          .select({ id: accessRequests.id })
          .from(accessRequests)
          .innerJoin(users, eq(users.lineUserId, accessRequests.lineUserId))
          .where(eq(accessRequests.id, id))
          .limit(1);
        if (registered) {
          throw new HTTPException(409, { message: 'Already registered' });
        }
        throw new HTTPException(404, { message: 'Access request not found' });
      }
      return c.json({ id: userId }, 201);
    },
  )
  /** 申請を却下（削除）する（ADMIN のみ）。LINE ユーザーは再申請できる */
  .delete('/:id', requireAuth, requireRole('ADMIN'), async (c) => {
    const db = createDb(c.env.DB);
    const deleted = await db
      .delete(accessRequests)
      .where(eq(accessRequests.id, c.req.param('id')))
      .returning({ id: accessRequests.id });
    if (deleted.length === 0) {
      throw new HTTPException(404, { message: 'Access request not found' });
    }
    return c.body(null, 204);
  })
  /** 指定した申請だけをまとめて却下する（ADMIN のみ）。処理済みの ID は無視する */
  .post(
    '/reject-batch',
    requireAuth,
    requireRole('ADMIN'),
    validator('json', (value, c) => {
      const parsed = rejectBatchSchema.safeParse(value);
      if (!parsed.success) {
        return c.json({ message: parsed.error.message }, 400);
      }
      return parsed.data;
    }),
    async (c) => {
      const ids = [...new Set(c.req.valid('json').ids)];
      const db = createDb(c.env.DB);
      const deleted = await db
        .delete(accessRequests)
        .where(inArray(accessRequests.id, ids))
        .returning({ id: accessRequests.id });
      return c.json({ deletedCount: deleted.length });
    },
  );

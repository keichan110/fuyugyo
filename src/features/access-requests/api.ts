import { eq, lt, ne, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';

import { verifyAccessRequestToken } from '@/server/auth/access-request-token';
import { ACCESS_REQUEST_COOKIE, ACCESS_REQUEST_COOKIE_PATH } from '@/server/auth/cookies';
import { createDb, type Database } from '@/server/db/client';
import { accessRequests, users } from '@/server/db/schema';
import { rateLimit } from '@/server/middleware/rate-limit';
import type { Env } from '@/server/types';

import { ACCESS_REQUEST_LIMIT, accessRequestCutoff } from './constants';

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

/**
 * 利用申請の Hono ルート。
 * 未登録の LINE ユーザーが、callback で発行された申請 Cookie を持って申請する。
 * 未認証で到達できるため Rate Limit を適用する。
 */
export const accessRequestsRoute = new Hono<{ Bindings: Env }>()
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
    if (!profile) {
      throw new HTTPException(401, { message: 'Access request session is invalid' });
    }

    const db = createDb(c.env.DB);
    const [registered] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.lineUserId, profile.userId))
      .limit(1);
    if (registered) {
      throw new HTTPException(409, { message: 'Already registered' });
    }

    const now = new Date();
    const location = readLocation(c.req.raw);
    const pictureUrl = profile.pictureUrl ?? null;

    // 1. 期限切れの申請を削除する（件数にも含めない）
    // 2. 自分以外の申請が上限未満、または自分の申請が既にある場合に限り upsert する。
    //    条件を満たさなければ 0 行になり、上限到達として扱う
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
              sql`(SELECT count(*) FROM ${accessRequests} WHERE ${ne(accessRequests.lineUserId, profile.userId)}) < ${ACCESS_REQUEST_LIMIT}
                OR EXISTS (SELECT 1 FROM ${accessRequests} WHERE ${eq(accessRequests.lineUserId, profile.userId)})`,
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
      throw new HTTPException(403, { message: 'Access request limit reached' });
    }

    deleteCookie(c, ACCESS_REQUEST_COOKIE, { path: ACCESS_REQUEST_COOKIE_PATH });
    return c.json({ requestedAt: row.requestedAt.toISOString() }, 201);
  });

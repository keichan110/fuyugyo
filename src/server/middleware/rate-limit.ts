import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

import { type AuthVariables } from '@/server/middleware/auth';
import type { Env } from '@/server/types';

/**
 * Rate Limit ミドルウェア。
 * 未認証でアクセスできる認証系エンドポイント（LINE login/callback・招待検証）のみに適用し、
 * 認証済みの一般 CRUD には適用しない。方式は CF ネイティブ Rate Limiting バインディングで、
 * isolate 横断で正しく動作しインメモリ実装の問題（状態非共有）を持たない。
 */

/** クライアント IP を取得する。CF 配下では `CF-Connecting-IP` が信頼できる送信元 */
function getClientIp(headers: Headers): string {
  return headers.get('cf-connecting-ip') ?? headers.get('x-forwarded-for') ?? 'unknown';
}

/** `rateLimit` の追加設定 */
export type RateLimitOptions = {
  /**
   * 超過時に返すレスポンス。ページ遷移で開かれるエンドポイントで、
   * 429 JSON の代わりにリダイレクトなどを返したい場合に指定する。未指定なら 429 を投げる。
   */
  onLimited?: (c: Context<{ Bindings: Env }>) => Response | Promise<Response>;
};

/**
 * 認証系エンドポイント用の Rate Limit ミドルウェアを生成する。
 * クライアント IP と `bucket` を鍵にレート制限し、超過時は 429 を投げる
 * （`options.onLimited` 指定時はそのレスポンスを返す）。
 *
 * @param bucket - レート制限の区分名（例: "login"）。エンドポイントごとに鍵空間を分ける
 * @param options - 超過時の応答の差し替えなど
 */
export function rateLimit(bucket: string, options: RateLimitOptions = {}) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const ip = getClientIp(c.req.raw.headers);
    const { success } = await c.env.AUTH_RATE_LIMITER.limit({
      key: `${bucket}:${ip}`,
    });

    if (!success) {
      if (options.onLimited) {
        return options.onLimited(c);
      }
      throw new HTTPException(429, {
        message: 'Too many requests. Please try again later.',
      });
    }

    return next();
  });
}

/**
 * 認証済み高コスト read 用の Rate Limit。requireAuth の後段で userId をキーにレート制限する（issue #214）。
 */
export function readRateLimit() {
  return createMiddleware<{ Bindings: Env; Variables: AuthVariables }>(async (c, next) => {
    const { userId } = c.get('user');
    const key = `read:${userId}`;
    const { success } = await c.env.READ_RATE_LIMITER.limit({ key });

    if (!success) {
      console.warn(
        JSON.stringify({ event: 'rate_limit_exceeded', limiter: 'read', key, path: c.req.path }),
      );
      throw new HTTPException(429, {
        message: 'Too many requests. Please try again later.',
      });
    }

    await next();
  });
}

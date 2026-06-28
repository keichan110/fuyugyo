import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { Env } from '@/server/types';

/**
 * Rate Limit ミドルウェア（ADR 0004）。
 * 未認証でアクセスできる認証系エンドポイント（LINE login/callback・招待検証）のみに適用し、
 * 認証済みの一般 CRUD には適用しない。方式は CF ネイティブ Rate Limiting バインディングで、
 * isolate 横断で正しく動作しインメモリ実装の問題（状態非共有）を持たない。
 */

/** クライアント IP を取得する。CF 配下では `CF-Connecting-IP` が信頼できる送信元 */
function getClientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-forwarded-for') ??
    'unknown'
  );
}

/**
 * 認証系エンドポイント用の Rate Limit ミドルウェアを生成する。
 * クライアント IP と `bucket` を鍵にレート制限し、超過時は 429 を投げる。
 *
 * @param bucket - レート制限の区分名（例: "login"）。エンドポイントごとに鍵空間を分ける
 */
export function rateLimit(bucket: string) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const ip = getClientIp(c.req.raw.headers);
    const { success } = await c.env.AUTH_RATE_LIMITER.limit({
      key: `${bucket}:${ip}`,
    });

    if (!success) {
      throw new HTTPException(429, {
        message: 'Too many requests. Please try again later.',
      });
    }

    await next();
  });
}

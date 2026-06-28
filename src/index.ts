import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authRoute } from '@/features/auth/api';
import { healthRoute } from '@/features/health/api';
import type { Env } from '@/server/types';

const app = new Hono<{ Bindings: Env }>();

/**
 * 中央エラーハンドラ（ADR 0005）。
 * `HTTPException` は指定ステータスで、それ以外は 500 で統一形 `{ message }` に変換する。
 * 成功ルートのレスポンス型を汚さないため、エラーはここに集約する。
 */
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ message: err.message }, err.status);
  }
  // 予期せぬ例外は Cloudflare Logs に残し、原因調査できるようにする
  console.error('[onError] Unhandled error:', err);
  return c.json({ message: 'Internal Server Error' }, 500);
});

// 各 feature の Hono ルートを mount する。クライアントは AppType を type import するだけ。
const routes = app
  .route('/api/health', healthRoute)
  .route('/api/auth', authRoute);

/** Hono RPC 用のアプリ型。クライアントは `import type { AppType }` でのみ参照する。 */
export type AppType = typeof routes;

export default routes;

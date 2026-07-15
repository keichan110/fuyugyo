import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';

import { authRoute } from '@/features/auth/api';
import { availabilitiesRoute } from '@/features/availabilities/api';
import { certificationsRoute } from '@/features/certifications/api';
import { departmentShiftTypeCertificationsRoute } from '@/features/department-shift-type-certifications/api';
import { departmentShiftTypesRoute } from '@/features/department-shift-types/api';
import { healthRoute } from '@/features/health/api';
import { instructorsRoute } from '@/features/instructors/api';
import { invitationsRoute } from '@/features/invitations/api';
import { shiftTypesRoute } from '@/features/shift-types/api';
import { shiftsRoute } from '@/features/shifts/api';
import { usersRoute } from '@/features/users/api';
import type { Env } from '@/server/types';

const app = new Hono<{ Bindings: Env }>();

// API レスポンスにセキュリティヘッダを付与する（CSP はデフォルトで無効のためここでは付与しない）
app.use('*', secureHeaders());

// CSRF 多層防御: Origin/Sec-Fetch-Site を検証し、クロスサイトの状態変更リクエストを拒否する
// （Cookie の SameSite=Lax に加えた保険。同一オリジンの正規リクエストは通過する）
app.use('*', csrf());

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
  .route('/api/auth', authRoute)
  .route('/api/availabilities', availabilitiesRoute)
  .route('/api/certifications', certificationsRoute)
  .route('/api/department-shift-type-certifications', departmentShiftTypeCertificationsRoute)
  .route('/api/department-shift-types', departmentShiftTypesRoute)
  .route('/api/shift-types', shiftTypesRoute)
  .route('/api/instructors', instructorsRoute)
  .route('/api/invitations', invitationsRoute)
  .route('/api/users', usersRoute)
  .route('/api/shifts', shiftsRoute);

/** Hono RPC 用のアプリ型。クライアントは `import type { AppType }` でのみ参照する。 */
export type AppType = typeof routes;

export default routes;

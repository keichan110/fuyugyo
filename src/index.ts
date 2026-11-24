import type { ExecutionContext, ScheduledController } from '@cloudflare/workers-types';
import { captureCheckIn, withSentry } from '@sentry/cloudflare';
import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';

import { accessRequestsRoute } from '@/features/access-requests/api';
import { authRoute } from '@/features/auth/api';
import { availabilitiesRoute } from '@/features/availabilities/api';
import { certificationRequirementsRoute } from '@/features/certification-requirements/api';
import { certificationsRoute } from '@/features/certifications/api';
import { departmentShiftTypesRoute } from '@/features/department-shift-types/api';
import { healthRoute } from '@/features/health/api';
import { instructorsRoute } from '@/features/instructors/api';
import { invitationsRoute } from '@/features/invitations/api';
import { seasonAnalysisRoute } from '@/features/season-analysis/api';
import { shiftTypesRoute } from '@/features/shift-types/api';
import { shiftsRoute } from '@/features/shifts/api';
import { usersRoute } from '@/features/users/api';
import { weatherRoute } from '@/features/weather/api';
import { createDb } from '@/server/db/client';
import { captureServerError, workerSentryOptions } from '@/server/sentry';
import type { Env } from '@/server/types';
import { runWeatherFetch } from '@/server/weather-fetcher';

const app = new Hono<{ Bindings: Env }>();

// API レスポンスにセキュリティヘッダを付与する（CSP はデフォルトで無効のためここでは付与しない）
app.use('*', secureHeaders());

// CSRF 多層防御: Origin/Sec-Fetch-Site を検証し、クロスサイトの状態変更リクエストを拒否する
// （Cookie の SameSite=Lax に加えた保険。同一オリジンの正規リクエストは通過する）
app.use('*', csrf());

/**
 * 中央エラーハンドラ。
 * `HTTPException` は指定ステータスで、それ以外は 500 で統一形 `{ message }` に変換する。
 * 成功ルートのレスポンス型を汚さないため、エラーはここに集約する。
 */
app.onError((err, c) => {
  captureServerError(err);
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
  .route('/api/access-requests', accessRequestsRoute)
  .route('/api/availabilities', availabilitiesRoute)
  .route('/api/certifications', certificationsRoute)
  .route('/api/certification-requirements', certificationRequirementsRoute)
  .route('/api/department-shift-types', departmentShiftTypesRoute)
  .route('/api/shift-types', shiftTypesRoute)
  .route('/api/instructors', instructorsRoute)
  .route('/api/invitations', invitationsRoute)
  .route('/api/users', usersRoute)
  .route('/api/shifts', shiftsRoute)
  .route('/api/season-analysis', seasonAnalysisRoute)
  .route('/api/weather', weatherRoute);

/** Hono RPC 用のアプリ型。クライアントは `import type { AppType }` でのみ参照する。 */
export type AppType = typeof routes;

/**
 * Cron Trigger のハンドラ。天気予報の取得を `waitUntil` に載せ、
 * Sentry が通知を flush する前に処理が完了するよう、同じ Promise を返す。
 * 取得の開始と、成功・失敗の結果を Sentry Crons にチェックインする。
 */
function scheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const monitorSlug = 'weather-fetch';
  const checkInId = captureCheckIn(
    { monitorSlug, status: 'in_progress' },
    {
      schedule: { type: 'crontab', value: controller.cron },
      timezone: 'Etc/UTC',
      checkinMargin: 5,
      maxRuntime: 5,
      failureIssueThreshold: 1,
      recoveryThreshold: 1,
    },
  );
  const task = (async () => {
    let ok = false;
    try {
      ok = await runWeatherFetch(createDb(env.DB), { now: new Date(), fetchFn: fetch });
    } finally {
      // 取得側で捕捉した失敗も、開始時と同じチェックインの失敗として記録する。
      captureCheckIn({ monitorSlug, checkInId, status: ok ? 'ok' : 'error' });
    }
  })();
  ctx.waitUntil(task);
  return task;
}

// Hono アプリに scheduled を足して export する。`fetch` / `request` はそのまま使える
export default withSentry(workerSentryOptions, Object.assign(routes, { scheduled }));

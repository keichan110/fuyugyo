import * as Sentry from '@sentry/cloudflare';
import { HTTPException } from 'hono/http-exception';

import type { Env } from './types';

/** Worker の通知を設定し、認証情報を含み得るリクエスト情報を収集しない。 */
export function workerSentryOptions(env: Env): Sentry.CloudflareOptions {
  return {
    enabled: Boolean(env.SENTRY_DSN),
    ...(env.SENTRY_DSN ? { dsn: env.SENTRY_DSN } : {}),
    ...(env.SENTRY_RELEASE ? { release: env.SENTRY_RELEASE } : {}),
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    // 外部 API へトレース情報を送らず、エラー通知だけを行う。
    tracePropagationTargets: [],
    beforeSend(event) {
      // OAuth コードや招待トークンは URL、ログにも含まれるため丸ごと除外する。
      delete event.request;
      delete event.breadcrumbs;
      if (event.user) {
        event.user = event.user.id === undefined ? {} : { id: event.user.id };
      }
      return event;
    },
  };
}

/** 中央エラーハンドラが処理する例外のうち、想定内の HTTP 応答を除いて通知する。 */
export function captureServerError(error: Error): void {
  if (error instanceof HTTPException && error.status < 500) return;
  Sentry.captureException(error);
}

/** 外部 API の失敗を、本文や認証情報を含めずに通知する。 */
export function captureExternalApiError(endpoint: string, status: number): void {
  Sentry.captureException(new Error(`External API failed: ${endpoint} (${status})`), {
    tags: { endpoint, httpStatus: status },
  });
}

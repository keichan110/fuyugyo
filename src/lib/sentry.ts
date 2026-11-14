import * as Sentry from '@sentry/react';

import { isIgnoredBrowserError } from './sentry-filter';

/** DSN が設定された場合だけブラウザのエラー通知を有効にする。 */
export function initializeSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    environment: import.meta.env.MODE,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    // Replay・トレースは有効化せず、未処理例外の既定の収集のみ利用する。
    beforeSend(event, hint) {
      return isIgnoredBrowserError(event, hint.originalException) ? null : event;
    },
  });
}

/** Router が捕捉した描画・読み込みエラーを通知する。 */
export function captureRouteError(error: unknown): void {
  Sentry.captureException(error);
}

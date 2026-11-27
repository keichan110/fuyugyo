import * as Sentry from '@sentry/react';

import { isIgnoredBrowserError } from './sentry-filter';

/**
 * ループバックのホスト名かどうかを判定する。
 * @param hostname `URL.hostname` 形式のホスト名（IPv6 は `[::1]`）
 * @returns localhost・127.0.0.1・[::1] のいずれかなら true
 */
export function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/**
 * DSN が設定され、かつループバック以外のホストで動作する場合だけブラウザのエラー通知を有効にする。
 * リリース E2E やプレビューは本番ビルド（DSN 埋め込み済み）をローカルで動かすため、
 * ループバックのホストでは初期化せず、本番の Sentry へ送信しない。
 * @param hostname 動作中のホスト名（ブラウザでは `window.location.hostname`）
 */
export function initializeSentry(hostname: string): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  if (isLoopbackHost(hostname)) return;

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

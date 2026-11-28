/**
 * LINE Messaging API の Reply。
 *
 * 呼び出し元の処理を失敗させないよう例外は投げず、再試行も Push への切り替えもしない。
 */

import type { LineMessage } from './message';

const REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply';
const REPLY_TIMEOUT_MS = 5000;

/**
 * Reply token を使ってメッセージを返信する。
 * ログには秘密情報や本文が混入しないよう、固定の失敗種別と HTTP ステータスだけを残す。
 *
 * @param accessToken - Messaging API のチャネルアクセストークン
 * @param replyToken - 受信イベントの Reply token（一度だけ使える）
 * @param messages - 返信するメッセージ（1〜5件）
 */
export async function sendLineReply(
  accessToken: string,
  replyToken: string,
  messages: LineMessage[],
): Promise<void> {
  const signal = AbortSignal.timeout(REPLY_TIMEOUT_MS);
  try {
    const response = await fetch(REPLY_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ replyToken, messages }),
      signal,
    });
    if (!response.ok) {
      console.error('[line-webhook] reply failed', {
        kind: 'http_error',
        status: response.status,
      });
    }
    // 応答本文は使わないため破棄する。破棄の失敗は返信の成否に影響しない。
    await response.body?.cancel().catch(() => undefined);
  } catch {
    console.error('[line-webhook] reply failed', {
      kind: signal.aborted ? 'timeout' : 'network_error',
    });
  }
}

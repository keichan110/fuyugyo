/**
 * 本人宛てのお知らせの返信（サーバー専用）。受信・認可・送信は呼び出し元が担当する。
 */

import { listUnreadNotifications } from '@/features/notifications/api';
import type { Database } from '@/server/db/client';
import type { LineMessage } from '@/server/line/message';
import type { LineReplyUser } from '@/server/line/reply-user';

import { renderAnnouncementsMessage } from './message';

/** 1回の返信で表示する通知の件数 */
const DISPLAY_LIMIT = 5;
const FETCH_FAILURE_TEXT = 'お知らせを取得できませんでした。時間をおいて、もう一度お試しください。';

/**
 * 本人宛ての未読通知を返信メッセージにする。照会だけを行い、既読状態は変えない。
 *
 * @param db - Drizzle の DB クライアント
 * @param user - 返信を許可されたユーザー。この本人宛ての通知だけを読む
 * @returns 新しい順に最大5件のカード。未読がない場合と取得に失敗した場合はテキスト
 */
export async function buildAnnouncementsMessage(
  db: Database,
  user: LineReplyUser,
): Promise<LineMessage> {
  // 例外はクエリ引数（ユーザー ID）を含み得るため、内容を受け取らない
  const announcements = await listUnreadNotifications(db, user.userId, DISPLAY_LIMIT).catch(
    () => null,
  );
  if (!announcements) {
    console.error('[line-webhook] announcements failed', { kind: 'db_error' });
    return { type: 'text', text: FETCH_FAILURE_TEXT };
  }
  return renderAnnouncementsMessage(announcements);
}

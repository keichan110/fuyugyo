/**
 * 本人の直近の勤務予定の返信（サーバー専用）。受信・認可・送信は呼び出し元が担当する。
 */

import { loadPublishedScheduleByDates, loadUpcomingWorkingDates } from '@/features/shifts/api';
import { scheduleToday } from '@/lib/schedule-date-range';
import type { Database } from '@/server/db/client';
import type { LineMessage } from '@/server/line/message';
import type { LineReplyUser } from '@/server/line/reply-user';

import { renderScheduleMessage } from '../schedule-message';

const UNLINKED_TEXT = 'インストラクター情報が紐付いていないため、勤務予定を確認できません。';
const NO_UPCOMING_TEXT = '今後の勤務予定はありません';

/**
 * 日本時間の当日以降で本人が担当する直近の勤務日について、その日の公開済み勤務を返信メッセージにする。
 *
 * @param db - Drizzle の DB クライアント
 * @param user - 返信を許可されたユーザー。対象日の選定と本人の強調に使う
 * @param now - 当日の判定に使う現在日時
 * @returns 勤務日ごとのカード、または未紐付けか今後の勤務予定がないことを知らせるテキスト
 */
export async function buildMyScheduleMessage(
  db: Database,
  user: LineReplyUser,
  now = new Date(),
): Promise<LineMessage> {
  const { instructorId } = user;
  if (!instructorId) return { type: 'text', text: UNLINKED_TEXT };

  const candidates = await loadUpcomingWorkingDates(db, instructorId, scheduleToday(now));
  const shifts = await loadPublishedScheduleByDates(db, candidates);
  // 候補日の選定後に非公開化や割り当て解除があった日は、本人の勤務日として表示しない
  const [first, ...rest] = candidates.filter((date) =>
    shifts.some(
      (shift) =>
        shift.date === date &&
        shift.assignedInstructors.some((member) => member.id === instructorId),
    ),
  );
  if (!first) return { type: 'text', text: NO_UPCOMING_TEXT };

  return renderScheduleMessage({
    label: '直近の勤務予定',
    dates: [first, ...rest],
    shifts,
    instructorId,
  });
}

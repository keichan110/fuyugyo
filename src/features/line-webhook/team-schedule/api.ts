/**
 * 全体の勤務予定の返信（サーバー専用）。受信・認可・送信は呼び出し元が担当する。
 */

import { loadPublishedSchedule } from '@/features/shifts/api';
import { scheduleToday } from '@/lib/schedule-date-range';
import type { Database } from '@/server/db/client';
import type { LineMessage } from '@/server/line/message';
import type { LineReplyUser } from '@/server/line/reply-user';

import { renderScheduleMessage } from '../schedule-message';

/** 当日を含めて表示する日数 */
const PERIOD_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 日本時間の当日から7日間の公開済み勤務を返信メッセージにする。
 *
 * @param db - Drizzle の DB クライアント
 * @param user - 返信を許可されたユーザー。本人の強調に使う
 * @param now - 当日の判定に使う現在日時
 * @returns 日付ごとのカード、または勤務予定がないことを知らせるテキスト
 */
export async function buildTeamScheduleMessage(
  db: Database,
  user: LineReplyUser,
  now = new Date(),
): Promise<LineMessage> {
  const today = scheduleToday(now);
  const todayTime = Date.parse(`${today}T00:00:00.000Z`);
  const dateAfter = (days: number) =>
    new Date(todayTime + days * DAY_MS).toISOString().slice(0, 10);
  const dates: [string, ...string[]] = [
    today,
    ...Array.from({ length: PERIOD_DAYS - 1 }, (_, index) => dateAfter(index + 1)),
  ];
  const shifts = await loadPublishedSchedule(db, today, dateAfter(PERIOD_DAYS - 1));

  return renderScheduleMessage({
    label: '全体の勤務予定',
    dates,
    shifts,
    instructorId: user.instructorId,
  });
}

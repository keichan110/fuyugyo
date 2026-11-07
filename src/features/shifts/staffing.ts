import { isJapaneseHoliday, weekdayIndex } from './view-utils';

/**
 * 必要人数と配置人数から導く充足状況。
 * 行なし（required が null）は未設定、0 は開講予定なしを表す（ADR 0015）。
 */
export type StaffingStatus = 'UNSET' | 'NOT_PLANNED' | 'SHORT' | 'FILLED';

/**
 * 必要人数（未設定は null）と配置人数から充足状況を導出する。
 * 配置が必要人数以上なら過員や、必要人数0で配置ありの場合も FILLED とする。
 */
export function deriveStaffingStatus(required: number | null, assigned: number): StaffingStatus {
  if (required === null) return 'UNSET';
  if (required === 0 && assigned === 0) return 'NOT_PLANNED';
  return assigned < required ? 'SHORT' : 'FILLED';
}

/**
 * セルに表示する数字。必要人数があれば「配置/必要」（`2/3`、開講予定なしは `0/0`）。
 * 未設定は配置1名以上のとき配置人数だけ（`2`）を返し、配置0名なら表示しない（null）。
 */
export function formatStaffingText(required: number | null, assigned: number): string | null {
  if (required === null) return assigned > 0 ? `${assigned}` : null;
  return `${assigned}/${required}`;
}

/** 充足状況を含むスクリーンリーダー向けの説明文。 */
export function describeStaffing(required: number | null, assigned: number): string {
  const status = deriveStaffingStatus(required, assigned);
  switch (status) {
    case 'UNSET':
      return `配置${assigned}名、必要人数未設定`;
    case 'NOT_PLANNED':
      return '開講予定なし';
    case 'SHORT':
      return `配置${assigned}名、必要${required}名、不足`;
    case 'FILLED':
      return assigned > (required ?? 0)
        ? `配置${assigned}名、必要${required}名、過員`
        : `配置${assigned}名、必要${required}名、充足`;
  }
}

/** 月次集計: 不足日数（SHORT の日）と未設定枠数（UNSET の日）。 */
export type StaffingMonthlySummary = { shortDays: number; unsetCount: number };

/**
 * 日ごとの必要人数・配置人数の一覧から月次集計を作る。
 * 対象の部門・シフト種別・月の全日を渡すこと。
 */
export function summarizeStaffing(
  days: readonly { required: number | null; assigned: number }[],
): StaffingMonthlySummary {
  let shortDays = 0;
  let unsetCount = 0;
  for (const day of days) {
    const status = deriveStaffingStatus(day.required, day.assigned);
    if (status === 'SHORT') shortDays += 1;
    if (status === 'UNSET') unsetCount += 1;
  }
  return { shortDays, unsetCount };
}

/** 平日／土日祝の初期値。 */
export type InitialRequiredCounts = { weekday: number; weekendHoliday: number };

/** 日付に対する初期の必要人数を返す。土日または祝日は weekendHoliday、それ以外は weekday。 */
export function resolveInitialRequiredCount(date: string, counts: InitialRequiredCounts): number {
  const day = weekdayIndex(date);
  return day === 0 || day === 6 || isJapaneseHoliday(date) ? counts.weekendHoliday : counts.weekday;
}

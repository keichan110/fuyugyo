import type { Availability } from '@/features/availabilities/schema';

/** 勤務可否の取得状態を含む、配置者アイコンの表示状態。 */
export type AvailabilityDisplayStatus = Availability['type'] | 'NOT_ENTERED' | 'LOADING' | 'ERROR';

/** 未入力と未取得・取得失敗を区別して勤務可否の表示を導く。 */
export function availabilityDisplay(
  availability: Availability | undefined,
  ready: boolean,
  failed: boolean,
): { status: AvailabilityDisplayStatus; label: string } {
  if (failed) return { status: 'ERROR', label: '勤務可否の取得に失敗' };
  if (!ready) return { status: 'LOADING', label: '勤務可否を読み込み中' };
  if (!availability) return { status: 'NOT_ENTERED', label: '勤務可否未入力' };
  const labels = { AVAILABLE: '勤務可', AVOID: '要調整', UNAVAILABLE: '勤務不可' };
  const note = availability.note?.trim();
  return {
    status: availability.type,
    label: `${labels[availability.type]}${note ? `（${note}）` : ''}`,
  };
}

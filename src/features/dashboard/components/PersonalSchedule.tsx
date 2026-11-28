import { DashboardSection } from './DashboardSection';
import { PersonalShiftCalendar } from './PersonalShiftCalendar';
import { UpcomingShifts } from './UpcomingShifts';

/**
 * 個人の予定セクション。直近の勤務予定と、今月・来月のカレンダーを別々の白い面に表示する。
 * 未連携ユーザーには呼び出し元（ダッシュボード）がそもそも描画しない前提。
 */
export function PersonalSchedule({ instructorId, today }: { instructorId: string; today: string }) {
  return (
    <DashboardSection title="個人の予定">
      <UpcomingShifts instructorId={instructorId} today={today} />
      <PersonalShiftCalendar instructorId={instructorId} today={today} />
    </DashboardSection>
  );
}

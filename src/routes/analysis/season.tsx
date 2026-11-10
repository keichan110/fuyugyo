import { Container } from '@mantine/core';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { fetchMe } from '@/features/auth/auth-guard';
import { hasMinimumRole } from '@/features/auth/schema';
import { departmentCodeSchema, type DepartmentCode } from '@/features/departments/schema';
import { SeasonAnalysisPage } from '@/features/season-analysis/components/SeasonAnalysisPage';
import { currentSeasonStartYear } from '@/features/season-analysis/season-label';
import { todayString } from '@/features/shifts/view-utils';

/** シーズン分析の検索パラメータ。省略時は今シーズン・全体として扱う */
type AnalysisSearch = {
  /** シーズン開始年 */
  season?: number;
  department?: DepartmentCode;
};

/**
 * `/analysis/season` — シーズン分析。
 *
 * 認証は親レイアウト（`analysis/route.tsx`）で担保済み。ここでは MANAGER 以上のロールチェックのみを行う。
 */
export const Route = createFileRoute('/analysis/season')({
  validateSearch: (search: Record<string, unknown>): AnalysisSearch => {
    const season = Number(search.season);
    const department = departmentCodeSchema.safeParse(search.department);
    return {
      ...(Number.isInteger(season) && season >= 2000 && season <= 2100 ? { season } : {}),
      ...(department.success ? { department: department.data } : {}),
    };
  },
  beforeLoad: async ({ context }) => {
    const user = await fetchMe(context.queryClient);
    if (!user || !hasMinimumRole(user.role, 'MANAGER')) {
      throw redirect({ to: '/' });
    }
  },
  component: SeasonAnalysisRoute,
});

function SeasonAnalysisRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Container size="xl" py="md">
      <SeasonAnalysisPage
        season={search.season ?? currentSeasonStartYear(todayString())}
        onSeasonChange={(season) => {
          void navigate({ search: (prev) => ({ ...prev, season }) });
        }}
        department={search.department ?? 'all'}
        onDepartmentChange={(department) => {
          void navigate({
            // 全体は省略で表す（undefined を代入せずキーごと除く）
            search: (prev) => ({
              ...(prev.season === undefined ? {} : { season: prev.season }),
              ...(department === 'all' ? {} : { department }),
            }),
          });
        }}
      />
    </Container>
  );
}

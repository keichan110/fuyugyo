import type { AnalysisFilters } from '../src/features/season-analysis/aggregators';
import type { SeasonAnalysis } from '../src/features/season-analysis/schema';

/** シーズン分析の集計テストで共有するフィクスチャ。基準日は 2026-11-10。 */

/** 基準日 */
export const TODAY = '2026-11-10';
/** 全体・下書き込み・全部門で数えるフィルタ */
export const filters: AnalysisFilters = {
  department: 'all',
  includeDrafts: true,
  countScope: 'allDepartments',
};

/** 4名（a〜d）を含むシーズン分析の応答を作る */
export function analysis(overrides: Partial<SeasonAnalysis> = {}): SeasonAnalysis {
  return {
    seasonRange: { from: '2026-09-01', to: '2027-08-31' },
    today: TODAY,
    instructors: ['a', 'b', 'c', 'd'].map((id) => ({
      id,
      displayName: id,
      status: 'ACTIVE',
      qualifiedDepartments: [],
    })),
    assignments: [],
    shifts: [],
    availabilityExceptions: [],
    tierDefinitions: [],
    ...overrides,
  };
}

/** 配置行を作る */
export function assign(
  instructorId: string,
  date: string,
  options: {
    departmentCode?: 'ski' | 'snowboard';
    shiftTypeId?: string;
    shiftStatus?: 'DRAFT' | 'PUBLISHED';
    tierRank?: number | null;
  } = {},
): SeasonAnalysis['assignments'][number] {
  return {
    instructorId,
    date,
    departmentCode: options.departmentCode ?? 'ski',
    shiftTypeId: options.shiftTypeId ?? 'am',
    shiftStatus: options.shiftStatus ?? 'PUBLISHED',
    tierRank: options.tierRank ?? null,
  };
}

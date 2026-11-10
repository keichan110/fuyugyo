import { departmentCodeSchema, type DepartmentCode } from '@/features/departments/schema';

import { isVisible, matchesDepartmentFilter, type AnalysisFilters } from './aggregators';
import type { SeasonAnalysis } from './schema';

/**
 * 特定の人への依存の集計。部門フィルタ内の配置を、日ではなく枠単位（回数）で資格ランクごとに数える。
 * ランク名は部門ごとに違うため、部門をまたいでまとめない。
 */

/** 上位何名の占有率を見るか */
export const TOP_SHARE_MEMBER_COUNT = 3;

/** 担当者1名分の担当回数 */
export type DependencyMember = { id: string; name: string; count: number; share: number };

/** ランク1段分の集計。tierRank が null は必要資格のランク外（資格なし起用） */
export type DependencyRank = {
  tierRank: number | null;
  /** 資格の短縮名を「・」で連結した表示名。ランク外は「ランク外」 */
  label: string;
  assignmentCount: number;
  memberCount: number;
  /** 上位3名の占有率（0〜1）。配置がなければ null */
  topShare: number | null;
  /** 担当回数の降順 */
  members: DependencyMember[];
};

/** 部門1つ分の依存状況 */
export type DepartmentDependency = {
  departmentCode: DepartmentCode;
  /** 部門に資格ランクの定義があるか */
  hasTiers: boolean;
  ranks: DependencyRank[];
  /** 部門内の全ランク合算のメンバー別担当回数（降順） */
  members: DependencyMember[];
  assignmentCount: number;
};

function rankLabel(tierRank: number | null, shortNames: string[]): string {
  if (tierRank === null) return 'ランク外';
  return shortNames.length === 0 ? `ランク${tierRank}` : shortNames.join('・');
}

/** 担当回数のマップから降順のメンバー一覧を作る */
function toMembers(
  counts: ReadonlyMap<string, number>,
  nameById: ReadonlyMap<string, string>,
): DependencyMember[] {
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      name: nameById.get(id) ?? id,
      count,
      share: total === 0 ? 0 : count / total,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'));
}

/**
 * 部門ごと・資格ランクごとの担当回数、上位3名の占有率、担当人数を求める。
 * @param data - API 応答
 * @param filters - 部門・下書き（負荷の数え方は影響しない）
 */
export function buildDependency(
  data: SeasonAnalysis,
  filters: AnalysisFilters,
): DepartmentDependency[] {
  const nameById = new Map(data.instructors.map((i) => [i.id, i.displayName]));
  return departmentCodeSchema.options
    .filter((code) => matchesDepartmentFilter(code, filters.department))
    .map((departmentCode) => {
      // ランク → 資格短縮名（シフト種別が複数ある場合は重複除去して連結する）
      const namesByRank = new Map<number, string[]>();
      for (const definition of data.tierDefinitions) {
        if (definition.departmentCode !== departmentCode) continue;
        const names = namesByRank.get(definition.tierRank) ?? [];
        if (!names.includes(definition.certificationShortName)) {
          names.push(definition.certificationShortName);
        }
        namesByRank.set(definition.tierRank, names);
      }

      const countsByRank = new Map<number | null, Map<string, number>>();
      for (const rank of namesByRank.keys()) countsByRank.set(rank, new Map());
      const allCounts = new Map<string, number>();
      for (const assignment of data.assignments) {
        if (
          assignment.departmentCode !== departmentCode ||
          !isVisible(assignment.shiftStatus, filters.includeDrafts)
        ) {
          continue;
        }
        const counts = countsByRank.get(assignment.tierRank) ?? new Map<string, number>();
        counts.set(assignment.instructorId, (counts.get(assignment.instructorId) ?? 0) + 1);
        countsByRank.set(assignment.tierRank, counts);
        allCounts.set(assignment.instructorId, (allCounts.get(assignment.instructorId) ?? 0) + 1);
      }

      const ranks: DependencyRank[] = [...countsByRank.entries()]
        // ランク外（null）は最後に置く
        .sort(([a], [b]) => (a ?? Infinity) - (b ?? Infinity))
        .map(([tierRank, counts]) => {
          const members = toMembers(counts, nameById);
          const assignmentCount = members.reduce((sum, m) => sum + m.count, 0);
          const topCount = members
            .slice(0, TOP_SHARE_MEMBER_COUNT)
            .reduce((sum, m) => sum + m.count, 0);
          return {
            tierRank,
            label: rankLabel(tierRank, tierRank === null ? [] : (namesByRank.get(tierRank) ?? [])),
            assignmentCount,
            memberCount: members.length,
            topShare: assignmentCount === 0 ? null : topCount / assignmentCount,
            members,
          };
        });
      const members = toMembers(allCounts, nameById);
      return {
        departmentCode,
        hasTiers: namesByRank.size > 0,
        ranks,
        members,
        assignmentCount: members.reduce((sum, m) => sum + m.count, 0),
      };
    });
}

import { getDepartmentAppearance } from '@/features/departments/appearance';
import {
  DEPARTMENT_LABELS,
  departmentCodeSchema,
  type DepartmentCode,
} from '@/features/departments/schema';

import { isInCountScope, isVisible, selectMemberIds, type AnalysisFilters } from './aggregators';
import type { SeasonAnalysis } from './schema';

/**
 * メンバー別の勤務種別の構成比。単位は「回数」（枠単位。同日に2種別へ入れば各1回）で、
 * 依存（E）と同じ。対象メンバー・下書き・部門フィルタ・負荷の数え方は A と同じ定義を適用する。
 */

/** 構成比の系列（部門×種別、または種別） */
export type MixSeries = {
  /** 安定キー（`部門:種別ID`） */
  key: string;
  /** 表示名。複数部門を含むときは「スキー／一般レッスン」、1部門のみなら種別名 */
  label: string;
  /** 全メンバー合計の回数 */
  total: number;
  /** Mantine の色指定（例: `blue.7`）。部門色の濃淡で、部門×種別キーから安定して決まる */
  color: string;
};

/** メンバー1名分の構成比 */
export type MemberMix = {
  id: string;
  name: string;
  /** 合計回数（1以上） */
  total: number;
  /** 系列キー → 回数 */
  counts: Record<string, number>;
  /** 系列キー → 割合（%） */
  shares: Record<string, number>;
};

/** 部門色の濃淡（Mantine のシェード）。隣り合う系列の見分けがつく順で、種別が多ければ循環する */
const SHADE_CYCLE = [7, 5, 3, 8, 4, 6, 2, 9] as const;

/**
 * 系列に色を割り当てる。同じ部門は部門色（`getDepartmentAppearance`）の濃淡で揃え、
 * 部門内のシェードは種別IDの安定した順序で決める（回数やフィルタの状態に左右されない）。
 * @param entries - 系列のキー・部門・種別ID
 * @returns 系列キー → Mantine の色指定（例: `blue.7`）
 */
export function assignSeriesColors(
  entries: { key: string; departmentCode: DepartmentCode; shiftTypeId: string }[],
): Map<string, string> {
  const colors = new Map<string, string>();
  for (const code of departmentCodeSchema.options) {
    const base = getDepartmentAppearance(code).color;
    entries
      .filter((entry) => entry.departmentCode === code)
      .sort((a, b) => a.shiftTypeId.localeCompare(b.shiftTypeId))
      .forEach((entry, index) => {
        colors.set(entry.key, `${base}.${SHADE_CYCLE[index % SHADE_CYCLE.length] ?? 6}`);
      });
  }
  return colors;
}

/** 構成比の集計結果 */
export type ShiftTypeMix = {
  /** 部門ごとにまとめ、部門内は回数の多い順 */
  series: MixSeries[];
  /** 最多系列の割合が高い順 */
  members: MemberMix[];
  /** 配置が0回で除外した対象メンバーの人数 */
  excludedCount: number;
};

/**
 * メンバー別の勤務種別の構成比を求める。
 * @param data - API 応答
 * @param filters - 部門・下書き・負荷の数え方
 */
export function buildShiftTypeMix(data: SeasonAnalysis, filters: AnalysisFilters): ShiftTypeMix {
  const memberIds = selectMemberIds(data, filters);
  const typeNameById = new Map<string, string>();
  for (const shift of data.shifts) {
    if (!typeNameById.has(shift.shiftTypeId))
      typeNameById.set(shift.shiftTypeId, shift.shiftTypeName);
  }

  const countsByMember = new Map<string, Map<string, number>>();
  const seriesTotals = new Map<string, number>();
  const seriesMeta = new Map<string, { departmentCode: DepartmentCode; shiftTypeId: string }>();
  for (const assignment of data.assignments) {
    if (
      !memberIds.has(assignment.instructorId) ||
      !isVisible(assignment.shiftStatus, filters.includeDrafts) ||
      !isInCountScope(assignment.departmentCode, filters)
    ) {
      continue;
    }
    const key = `${assignment.departmentCode}:${assignment.shiftTypeId}`;
    seriesMeta.set(key, {
      departmentCode: assignment.departmentCode,
      shiftTypeId: assignment.shiftTypeId,
    });
    seriesTotals.set(key, (seriesTotals.get(key) ?? 0) + 1);
    const counts = countsByMember.get(assignment.instructorId) ?? new Map<string, number>();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    countsByMember.set(assignment.instructorId, counts);
  }

  // 1部門だけが対象のときは部門名を省き、種別名だけで表示する
  const departmentsInSeries = new Set([...seriesMeta.values()].map((meta) => meta.departmentCode));
  const withDepartment = departmentsInSeries.size > 1;
  const departmentOrder = new Map(departmentCodeSchema.options.map((code, index) => [code, index]));
  // 色はフィルタに関係なくシーズン内の全枠の部門×種別で割り当て、絞り込みで系列が増減しても同じ色を保つ
  const colorEntries = new Map<string, { departmentCode: DepartmentCode; shiftTypeId: string }>();
  for (const shift of data.shifts) {
    colorEntries.set(`${shift.departmentCode}:${shift.shiftTypeId}`, {
      departmentCode: shift.departmentCode,
      shiftTypeId: shift.shiftTypeId,
    });
  }
  for (const [key, meta] of seriesMeta) colorEntries.set(key, meta);
  const colorByKey = assignSeriesColors(
    [...colorEntries.entries()].map(([key, meta]) => ({ key, ...meta })),
  );

  const series: MixSeries[] = [...seriesMeta.entries()]
    .map(([key, meta]) => {
      const typeName = typeNameById.get(meta.shiftTypeId) ?? meta.shiftTypeId;
      return {
        key,
        departmentCode: meta.departmentCode,
        label: withDepartment ? `${DEPARTMENT_LABELS[meta.departmentCode]}／${typeName}` : typeName,
        total: seriesTotals.get(key) ?? 0,
        color: colorByKey.get(key) ?? 'gray.6',
      };
    })
    // 部門ごとにまとめ、部門内は回数の多い順に並べる（凡例・積み上げ順）
    .sort(
      (a, b) =>
        (departmentOrder.get(a.departmentCode) ?? 0) -
          (departmentOrder.get(b.departmentCode) ?? 0) ||
        b.total - a.total ||
        a.key.localeCompare(b.key),
    )
    .map(({ key, label, total, color }) => ({ key, label, total, color }));

  const nameById = new Map(data.instructors.map((i) => [i.id, i.displayName]));
  const members: MemberMix[] = [];
  let excludedCount = 0;
  for (const id of memberIds) {
    const counts = countsByMember.get(id);
    if (!counts) {
      excludedCount += 1;
      continue;
    }
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    members.push({
      id,
      name: nameById.get(id) ?? id,
      total,
      counts: Object.fromEntries(counts),
      shares: Object.fromEntries([...counts].map(([key, count]) => [key, (count / total) * 100])),
    });
  }
  // 「全体で最も多い系列」は回数が最大の系列（部門順の並びとは独立に決める）
  const topKey = [...series].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key))[0]
    ?.key;
  const topShare = (member: MemberMix) => (topKey ? (member.shares[topKey] ?? 0) : 0);
  members.sort(
    (a, b) => topShare(b) - topShare(a) || b.total - a.total || a.name.localeCompare(b.name, 'ja'),
  );
  return { series, members, excludedCount };
}

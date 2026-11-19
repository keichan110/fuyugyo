import { scoreQualificationComposition } from '../qualification-composition';
import { dateInstructorKey, type AssignmentFrame, type PlanBasis } from './problem';

/** 割当案における1人分の事実。保存済みの勤務と提案中の勤務を合わせて数える。 */
export type InstructorLoad = {
  instructorId: string;
  /** 当該部門のシーズン勤務日数 */
  workDays: number;
  /** 各連勤の `max(連勤日数 − 3, 0)` の合計 */
  streakExcess: number;
  /** 要調整の日に提案で入った日数 */
  avoidDays: number;
};

/** 割当案における1枠分の事実。 */
export type FrameRanks = {
  date: string;
  /** 配置者それぞれの資格ランク（1 が最上位） */
  ranks: number[];
};

/** 割当案から集計した事実。優先順位の付け方を変えても、この内容は変わらない。 */
export type PlanSummary = {
  instructors: InstructorLoad[];
  frames: FrameRanks[];
  configuredRankCount: number;
};

/**
 * 割当案を人別・枠別の事実へ集計する。
 * 連勤は保存済みの勤務と提案中の勤務をつなげ、暦日で連続する日数を数える。
 */
export function summarizePlan(frames: readonly AssignmentFrame[], basis: PlanBasis): PlanSummary {
  const tallies = new Map(
    [...basis.baseline].map(([id, days]) => [id, { days: new Set(days), avoidDays: 0 }]),
  );
  const frameRanks = frames.map((frame): FrameRanks => {
    for (const id of frame.selected) {
      const tally = tallies.get(id);
      if (!tally) continue;
      tally.days.add(frame.day);
      if (basis.avoid.has(dateInstructorKey(frame.date, id))) tally.avoidDays += 1;
    }
    return {
      date: frame.date,
      ranks: frame.selected.map((id) => basis.rankById.get(id) ?? Infinity),
    };
  });
  const instructors = [...tallies].map(([instructorId, { days, avoidDays }]): InstructorLoad => {
    let previous: number | undefined;
    let run = 0;
    let streakExcess = 0;
    for (const day of [...days].sort((left, right) => left - right)) {
      run = previous !== undefined && day - previous === 1 ? run + 1 : 1;
      // 4日目以降を1日ずつ数えるので、連勤ごとに「日数 − 3」になる。
      if (run >= 4) streakExcess += 1;
      previous = day;
    }
    return { instructorId, workDays: days.size, streakExcess, avoidDays };
  });
  return { instructors, frames: frameRanks, configuredRankCount: basis.configuredRankCount };
}

/**
 * 割当案の良し悪しを測る基準。値が小さいほど良い。
 * 基準を足すときはここへ定義し、{@link PRIORITY} のどこかの段へ入れる。
 */
export const CRITERIA = {
  /** 要調整の人を使った回数 */
  avoidAssignments: (summary) => total(summary.instructors, (load) => load.avoidDays),
  /** 4連勤以上の超過日数 */
  consecutiveExcess: (summary) => total(summary.instructors, (load) => load.streakExcess),
  /** 勤務日数の偏り。2乗和なので、合計が同じなら日数が揃うほど小さくなる */
  workDayImbalance: (summary) => total(summary.instructors, (load) => load.workDays ** 2),
  /** 上位ランク不在。枠ごとに、最上位の配置者がランク1から何段下かを数える */
  rankRisk: (summary) =>
    total(
      summary.frames,
      (frame) => scoreQualificationComposition(frame.ranks, summary.configuredRankCount).safetyRisk,
    ),
  /** ランクの混在不足。枠ごとに、組めたはずの異なるランク数に足りない分を数える */
  rankDeficit: (summary) =>
    total(
      summary.frames,
      (frame) =>
        scoreQualificationComposition(frame.ranks, summary.configuredRankCount).diversityDeficit,
    ),
} satisfies Record<string, (summary: PlanSummary) => number>;

/** 基準の名前。 */
export type Criterion = keyof typeof CRITERIA;

/** 優先順位の1段。同じ段の基準は重みを掛けて合算し、ひとつの値として比べる。 */
export type PriorityTier = readonly { criterion: Criterion; weight: number }[];

/**
 * 基準の優先順位。前の段ほど優先し、後ろの段で逆転しない。
 * 1段に1基準なら順位固定になる。差の大きさで逆転させたい基準は、同じ段へ重み付きで並べる。
 * 順番の意味は docs/design/auto-assignment-rules.md の「ざっくり全体像」に対応する。
 */
export const PRIORITY: readonly PriorityTier[] = [
  [{ criterion: 'avoidAssignments', weight: 1 }],
  [{ criterion: 'consecutiveExcess', weight: 1 }],
  [{ criterion: 'workDayImbalance', weight: 1 }],
  [{ criterion: 'rankRisk', weight: 1 }],
  [{ criterion: 'rankDeficit', weight: 1 }],
];

/** 優先順位の段ごとの評価値。先頭の段から順に比べ、小さいほど良い。 */
export type Cost = readonly number[];

/**
 * 集計した事実を、優先順位の段ごとの評価値へ変換する。
 * @param summary - 割当案の集計
 * @param priority - 優先順位。省略時は {@link PRIORITY}
 */
export function scorePlan(
  summary: PlanSummary,
  priority: readonly PriorityTier[] = PRIORITY,
): Cost {
  return priority.map((tier) =>
    total(tier, ({ criterion, weight }) => weight * CRITERIA[criterion](summary)),
  );
}

/** 評価値を先頭の段から比べる。left が良ければ負、right が良ければ正、同じなら 0 を返す。 */
export function compareCost(left: Cost, right: Cost): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function total<T>(items: readonly T[], value: (item: T) => number): number {
  let sum = 0;
  for (const item of items) sum += value(item);
  return sum;
}

import { describe, expect, it } from 'vitest';

import { solveAutoAssignments } from '../src/features/shifts/auto-assign-solver';
import type { AutoAssignContext, AutoAssignExecutionParams } from '../src/features/shifts/schema';
import { resolveInitialRequiredCount } from '../src/features/shifts/staffing';

/**
 * 自動割当のロジック変更を検知するための回帰テスト。
 * 不変条件は優先順位を変えても守るべき絶対条件を、固定シナリオは現在の割当結果そのものを確かめる。
 */

type Scenario = { context: AutoAssignContext; params: AutoAssignExecutionParams };

const SHIFT = 'general-lesson';
const CERTIFICATIONS = ['指導員', '準指導員', '認定指導員'];

/** テスト入力を再現可能にするための線形合同法の乱数。 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

/** 2026-12-20 を起点にした日付。 */
function dateAt(offset: number): string {
  return new Date(Date.UTC(2026, 11, 20 + offset)).toISOString().slice(0, 10);
}

// 資格なし・候補外・他部門の勤務・公開済みの枠など、絶対条件に関わる状況を混ぜて作る。
function randomScenario(seed: number): Scenario {
  const random = createRandom(seed);
  const int = (bound: number) => Math.floor(random() * bound);
  const instructors: AutoAssignContext['instructors'] = Array.from(
    { length: 2 + int(8) },
    (_, index) => ({
      id: `p${index}`,
      displayName: `候補${index}`,
      certificationIds: [random() < 0.1 ? '資格なし' : (CERTIFICATIONS[int(3)] ?? '指導員')],
      availabilityStatus: 'SUBMITTED',
    }),
  );
  const targetDates = Array.from({ length: 1 + int(12) }, (_, index) => dateAt(10 + index)).filter(
    () => random() < 0.85,
  );
  const availabilities: AutoAssignContext['availabilities'] = [];
  const existingAssignments: AutoAssignContext['existingAssignments'] = [];
  for (const instructor of instructors) {
    for (let offset = 0; offset < 30; offset += 1) {
      const declaration = random();
      if (declaration < 0.24) {
        availabilities.push({
          instructorId: instructor.id,
          date: dateAt(offset),
          type: declaration < 0.12 ? 'UNAVAILABLE' : declaration < 0.2 ? 'AVOID' : 'AVAILABLE',
          note: null,
        });
      }
      const work = random();
      if (work < 0.15) {
        existingAssignments.push({
          date: dateAt(offset),
          departmentCode: work < 0.04 ? 'snowboard' : 'ski',
          shiftTypeId: work < 0.09 ? SHIFT : 'other',
          instructorIds: [instructor.id],
        });
      }
    }
  }
  return {
    context: {
      departmentCode: 'ski',
      period: { from: dateAt(0), to: dateAt(29) },
      instructors,
      frames: [
        {
          shiftTypeId: SHIFT,
          certificationTiers: CERTIFICATIONS.map((certificationId, index) => ({
            certificationId,
            tierRank: index + 1,
            shortName: certificationId,
          })),
          eligibleInstructorIds: instructors.filter(() => random() < 0.93).map(({ id }) => id),
        },
      ],
      availabilities,
      existingAssignments,
      publishedSlots: targetDates
        .filter(() => random() < 0.08)
        .map((date) => ({ date, departmentCode: 'ski' as const, shiftTypeId: SHIFT })),
    },
    params: {
      shiftTypeId: SHIFT,
      targetDates,
      requiredCountByDate: Object.fromEntries(targetDates.map((date) => [date, int(5)])),
    },
  };
}

/** ソルバーとは独立に、その日に入れる候補と要調整の人を求める。 */
function expectedCandidates({ context, params }: Scenario, date: string) {
  const published = new Set(
    context.publishedSlots
      .filter((slot) => slot.departmentCode === 'ski' && slot.shiftTypeId === SHIFT)
      .map((slot) => slot.date),
  );
  const replaced = new Set(params.targetDates.filter((target) => !published.has(target)));
  const declared = (type: 'UNAVAILABLE' | 'AVOID') =>
    new Set(
      context.availabilities
        .filter((item) => item.date === date && item.type === type)
        .map((item) => item.instructorId),
    );
  const unavailable = declared('UNAVAILABLE');
  const busy = new Set(
    context.existingAssignments
      .filter(
        (assignment) =>
          assignment.date === date &&
          // 置き換える対象枠の元の勤務だけは、同日重複に数えない。
          !(
            assignment.departmentCode === 'ski' &&
            assignment.shiftTypeId === SHIFT &&
            replaced.has(assignment.date)
          ),
      )
      .flatMap((assignment) => assignment.instructorIds),
  );
  const eligible = new Set(context.frames[0]?.eligibleInstructorIds);
  const candidates = context.instructors
    .filter(
      ({ id, certificationIds }) =>
        eligible.has(id) &&
        certificationIds.some((certification) => CERTIFICATIONS.includes(certification)) &&
        !unavailable.has(id) &&
        !busy.has(id),
    )
    .map(({ id }) => id);
  return { candidates, avoid: declared('AVOID'), published };
}

describe('自動割当の不変条件', () => {
  const seeds = Array.from({ length: 40 }, (_, index) => index + 1);

  it.each(seeds)('乱数入力 %i で絶対条件と人数の決まりを守る', (seed) => {
    const scenario = randomScenario(seed);
    const { proposals } = solveAutoAssignments(scenario.context, scenario.params, seed);
    const { published } = expectedCandidates(scenario, '');

    // 公開済みの枠を除いた対象日を、日付順にちょうど1件ずつ返す。
    expect(proposals.map((proposal) => proposal.date)).toEqual(
      scenario.params.targetDates.filter((date) => !published.has(date)).sort(),
    );
    for (const proposal of proposals) {
      const { candidates, avoid } = expectedCandidates(scenario, proposal.date);
      const required = scenario.params.requiredCountByDate[proposal.date] ?? 0;
      const selected = proposal.instructorIds;

      // 勤務不可・必要資格なし・候補外・同日重複の人は入れず、同じ人を二重に入れない。
      expect(candidates).toEqual(expect.arrayContaining(selected));
      expect(new Set(selected).size).toBe(selected.length);
      // 入れられる人がいる限り必要人数まで埋め、超えない。
      expect(selected).toHaveLength(Math.min(required, candidates.length));
      expect(proposal.shortage.count).toBe(required - selected.length);
      expect(proposal.shortage.reasons.length > 0).toBe(proposal.shortage.count > 0);
      // 要調整の人は、勤務可能な候補を使い切ったときだけ入る。
      const selectedAvoid = selected.filter((id) => avoid.has(id));
      if (selectedAvoid.length > 0) {
        expect(candidates.filter((id) => !avoid.has(id) && !selected.includes(id))).toEqual([]);
      }
      // 要調整の人を入れたら、必ず要確認として名前を返す。
      const avoidReason = proposal.reviewReasons?.find((reason) => reason.startsWith('要調整'));
      expect(avoidReason).toBe(
        selectedAvoid.length > 0
          ? `要調整の勤務: ${selectedAvoid.map((id) => id.replace('p', '候補')).join('、')}`
          : undefined,
      );
    }
    // 同じ入力とシードなら同じ結果になる。
    expect(solveAutoAssignments(scenario.context, scenario.params, seed).proposals).toEqual(
      proposals,
    );
  });
});

describe('固定シナリオの割当結果', () => {
  type Pressure = {
    /** 1人1日あたりの勤務不可の割合 */
    unavailableRate: number;
    /** 1人1日あたりの要調整の割合 */
    avoidRate: number;
    weekday: number;
    weekendHoliday: number;
  };
  // 申告が多く、要調整の起用と不足が出る月。
  const SCARCE: Pressure = {
    unavailableRate: 0.45,
    avoidRate: 0.15,
    weekday: 2,
    weekendHoliday: 3,
  };
  // 必要人数が多く、4連勤を避けきれない月。
  const BUSY: Pressure = { unavailableRate: 0.25, avoidRate: 0.15, weekday: 4, weekendHoliday: 5 };

  // 8人・2027年1月の1か月。申告は乱数で決めるが、シードを固定しているので毎回同じ入力になる。
  function monthScenario(pressure: Pressure): Scenario {
    const random = createRandom(2027);
    const instructors: AutoAssignContext['instructors'] = Array.from({ length: 8 }, (_, index) => ({
      id: `p${index}`,
      displayName: `候補${index}`,
      certificationIds: [CERTIFICATIONS[index % 3] ?? '指導員'],
      availabilityStatus: 'SUBMITTED',
    }));
    const targetDates = Array.from(
      { length: 31 },
      (_, index) => `2027-01-${String(index + 1).padStart(2, '0')}`,
    );
    const availabilities: AutoAssignContext['availabilities'] = [];
    for (const instructor of instructors) {
      for (const date of targetDates) {
        const declaration = random();
        if (declaration < pressure.unavailableRate + pressure.avoidRate) {
          availabilities.push({
            instructorId: instructor.id,
            date,
            type: declaration < pressure.unavailableRate ? 'UNAVAILABLE' : 'AVOID',
            note: null,
          });
        }
      }
    }
    return {
      context: {
        departmentCode: 'ski',
        period: { from: '2027-01-01', to: '2027-01-31' },
        instructors,
        frames: [
          {
            shiftTypeId: SHIFT,
            certificationTiers: CERTIFICATIONS.map((certificationId, index) => ({
              certificationId,
              tierRank: index + 1,
              shortName: certificationId,
            })),
            eligibleInstructorIds: instructors.map(({ id }) => id),
          },
        ],
        availabilities,
        // 12月の勤務日数に差を付け、平準化が働く状況にする。
        existingAssignments: instructors.flatMap(({ id }, index) =>
          Array.from({ length: index % 5 }, (_, day) => ({
            date: `2026-12-${String(1 + day * 2).padStart(2, '0')}`,
            departmentCode: 'ski' as const,
            shiftTypeId: 'past',
            instructorIds: [id],
          })),
        ),
        publishedSlots: [],
      },
      params: {
        shiftTypeId: SHIFT,
        targetDates,
        requiredCountByDate: Object.fromEntries(
          targetDates.map((date) => [date, resolveInitialRequiredCount(date, pressure)]),
        ),
      },
    };
  }

  /** 1枠を「日: 人,人」の1行にまとめる。要確認と不足は末尾に付ける。 */
  function render(pressure: Pressure, seed: number): string[] {
    const { context, params } = monthScenario(pressure);
    return solveAutoAssignments(context, params, seed).proposals.map((proposal) =>
      [
        `${proposal.date.slice(8)}: ${[...proposal.instructorIds].sort().join(',')}`,
        ...(proposal.reviewReasons ?? []),
        ...(proposal.shortage.count ? [`不足${proposal.shortage.count}`] : []),
      ].join(' / '),
    );
  }

  // 優先順位や探索を意図して変えたときは、結果の変化を確認したうえで期待値を更新する。
  it('申告の多い月・シード0の割当結果が変わらない', () => {
    expect(render(SCARCE, 0)).toEqual([
      '01: p5,p6,p7 / 要調整の勤務: 候補5',
      '02: p4,p7 / 不足1',
      '03: p0,p5,p7 / 要調整の勤務: 候補5',
      '04: p0,p7',
      '05: p4,p7 / 要調整の勤務: 候補4',
      '06: p1,p2',
      '07: p3,p4 / 要調整の勤務: 候補3',
      '08: p0,p5',
      '09: p0,p5,p6',
      '10: p2,p5,p7',
      '11: p2,p3,p6 / 要調整の勤務: 候補2',
      '12: p0,p1',
      '13: p0,p1',
      '14: p4,p6',
      '15: p0,p5',
      '16: p1,p2,p3',
      '17: p2,p5,p7',
      '18: p3,p5',
      '19: p2,p6',
      '20: p1,p6',
      '21: p4,p6 / 要調整の勤務: 候補6',
      '22: p3,p4',
      '23: p0,p1,p3',
      '24: p0,p1,p6',
      '25: p3,p5',
      '26: p0,p1',
      '27: p0,p1',
      '28: p3,p5',
      '29: p2,p7',
      '30: p4,p5,p6',
      '31: p2,p6,p7 / 要調整の勤務: 候補2',
    ]);
  }, 30_000);

  it('申告の多い月・シード100の割当結果が変わらない', () => {
    expect(render(SCARCE, 100)).toEqual([
      '01: p5,p6,p7 / 要調整の勤務: 候補5',
      '02: p4,p7 / 不足1',
      '03: p0,p5,p7 / 要調整の勤務: 候補5',
      '04: p0,p7',
      '05: p4,p7 / 要調整の勤務: 候補4',
      '06: p1,p2',
      '07: p3,p4 / 要調整の勤務: 候補3',
      '08: p0,p5',
      '09: p0,p5,p6',
      '10: p2,p5,p7',
      '11: p2,p3,p6 / 要調整の勤務: 候補2',
      '12: p0,p1',
      '13: p0,p1',
      '14: p4,p6',
      '15: p3,p5',
      '16: p1,p2,p3',
      '17: p2,p5,p7',
      '18: p3,p5',
      '19: p0,p2',
      '20: p1,p6',
      '21: p4,p6 / 要調整の勤務: 候補6',
      '22: p3,p4',
      '23: p0,p1,p3',
      '24: p0,p1,p6',
      '25: p0,p5',
      '26: p1,p6',
      '27: p0,p7',
      '28: p3,p5',
      '29: p2,p4',
      '30: p1,p5,p6',
      '31: p2,p6,p7 / 要調整の勤務: 候補2',
    ]);
  }, 30_000);

  it('必要人数の多い月・シード0の割当結果が変わらない', () => {
    expect(render(BUSY, 0)).toEqual([
      '01: p1,p4,p5,p6,p7 / 要調整の勤務: 候補4',
      '02: p2,p4,p5,p7 / 要調整の勤務: 候補2 / 不足1',
      '03: p0,p1,p3,p5,p6',
      '04: p0,p1,p2,p7',
      '05: p0,p4,p6,p7 / 要調整の勤務: 候補0、候補6',
      '06: p1,p2,p3,p7',
      '07: p1,p3,p4,p5 / 要調整の勤務: 候補5、候補1',
      '08: p3,p5,p6,p7',
      '09: p0,p1,p2,p4,p6',
      '10: p2,p4,p5,p7 / 不足1',
      '11: p0,p2,p3,p4,p6',
      '12: p0,p1,p3,p5',
      '13: p0,p1,p2,p4 / 要調整の勤務: 候補4',
      '14: p1,p4,p6,p7 / 要調整の勤務: 候補1',
      '15: p0,p3,p5,p6',
      '16: p0,p1,p2,p3,p6 / 要調整の勤務: 候補0',
      '17: p2,p3,p5,p6,p7',
      '18: p3,p4,p5,p7',
      '19: p0,p2,p6,p7',
      '20: p1,p3,p5,p6',
      '21: p2,p4,p5,p6',
      '22: p0,p3,p4,p7 / 要調整の勤務: 候補0',
      '23: p0,p1,p3,p5,p7',
      '24: p0,p1,p2,p3,p6',
      '25: p2,p4,p5,p6',
      '26: p0,p1,p5,p7',
      '27: p0,p1,p2,p7',
      '28: p0,p2,p3,p5',
      '29: p2,p4,p5,p7',
      '30: p0,p1,p4,p5,p6',
      '31: p0,p1,p2,p6,p7 / 要調整の勤務: 候補1',
    ]);
  }, 30_000);
});

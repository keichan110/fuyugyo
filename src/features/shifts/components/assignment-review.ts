import type { Availability } from '@/features/availabilities/schema';

import type { FrameComposition } from '../qualification-composition';
import type { AutoAssignContext } from '../schema';
import { computeWorkStreak, seasonRangeForDate, type CellAssignment } from '../workload';
import type { DayAssignments } from './calendar-events';

export type ReviewKind = 'shortage' | 'availability' | 'streak' | 'qualification';

export type AssignmentReviewDay = {
  date: string;
  issues: { kind: ReviewKind; text: string }[];
  addedIds: string[];
  removedIds: string[];
};

type AssignmentReviewInput = {
  days: string[];
  departmentCode: string;
  shiftTypeId: string;
  assignmentsByDay: DayAssignments;
  savedAssignments: CellAssignment[];
  stagedAssignments: CellAssignment[];
  requiredByDay: ReadonlyMap<string, number | null> | null;
  compositionByDay: ReadonlyMap<string, FrameComposition> | null;
  availabilities: Availability[] | undefined;
  context: AutoAssignContext | undefined;
};

/**
 * 表示中の枠の要確認事項と保存済みからの担当者差分を、現在案から導出する。
 * 連勤は自動割当と同じ現部門・全種別で、シーズン内の月外勤務と未保存編集を含める。
 */
export function buildAssignmentReview(input: AssignmentReviewInput): AssignmentReviewDay[] {
  const {
    days,
    departmentCode,
    shiftTypeId,
    assignmentsByDay,
    savedAssignments,
    stagedAssignments,
    requiredByDay,
    compositionByDay,
    availabilities,
    context,
  } = input;
  const savedByDate = new Map(
    savedAssignments
      .filter((cell) => cell.departmentCode === departmentCode && cell.shiftTypeId === shiftTypeId)
      .map((cell) => [cell.date, cell.instructorIds]),
  );
  const availabilityByPersonDay = new Map(
    (availabilities ?? []).map((item) => [`${item.instructorId}:${item.date}`, item]),
  );
  // 当月は月次データを使い、月外の保存済みだけをコンテキストから補う。
  const firstDay = days[0];
  if (!firstDay) {
    return [];
  }
  const month = firstDay.slice(0, 7);
  const stagedKeys = new Set(stagedAssignments.map((cell) => `${cell.date}:${cell.shiftTypeId}`));
  const currentAssignments = [
    ...(context?.existingAssignments ?? []).filter((cell) => !cell.date.startsWith(month)),
    ...savedAssignments.filter(
      (cell) =>
        cell.departmentCode !== departmentCode ||
        !stagedKeys.has(`${cell.date}:${cell.shiftTypeId}`),
    ),
    ...stagedAssignments,
  ];
  const workDatesByPerson = new Map<string, Set<string>>();
  for (const cell of currentAssignments) {
    if (cell.departmentCode !== departmentCode) {
      continue;
    }
    for (const id of cell.instructorIds) {
      const dates = workDatesByPerson.get(id) ?? new Set<string>();
      dates.add(cell.date);
      workDatesByPerson.set(id, dates);
    }
  }
  const knownInstructorIds = new Set(context?.instructors.map((person) => person.id));
  const season = seasonRangeForDate(firstDay);
  return days.map((date) => {
    const assigned = assignmentsByDay.get(date) ?? [];
    const savedIds = new Set(savedByDate.get(date) ?? []);
    const currentIds = new Set(assigned.map((person) => person.id));
    const issues: AssignmentReviewDay['issues'] = [];
    const required = requiredByDay?.get(date);
    if (required != null && assigned.length < required) {
      issues.push({
        kind: 'shortage',
        text: `${required - assigned.length}名不足（配置${assigned.length} / 必要${required}名）`,
      });
    }
    for (const person of assigned) {
      const availability = availabilityByPersonDay.get(`${person.id}:${date}`);
      if (availability && availability.type !== 'AVAILABLE') {
        issues.push({
          kind: 'availability',
          text: `${person.name}：${availability.type === 'AVOID' ? '要調整' : '勤務不可'}${availability.note ? `（${availability.note}）` : ''}`,
        });
      }
      // 月外の勤務を取得できない人を、連勤なしと断定しない。
      if (context && knownInstructorIds.has(person.id)) {
        const streak = computeWorkStreak(workDatesByPerson.get(person.id) ?? [], date, season);
        if (streak.days >= 4) {
          issues.push({
            kind: 'streak',
            text: `${person.name}：${streak.days}連勤（${streak.from.slice(5).replace('-', '/')}〜${streak.to.slice(5).replace('-', '/')}）`,
          });
        }
      }
    }
    for (const reason of compositionByDay?.get(date)?.reasons ?? []) {
      issues.push({ kind: 'qualification', text: reason });
    }
    return {
      date,
      issues,
      addedIds: [...currentIds].filter((id) => !savedIds.has(id)),
      removedIds: [...savedIds].filter((id) => !currentIds.has(id)),
    };
  });
}

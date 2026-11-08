import type { ScheduleEventData } from '@mantine/schedule';

import type { FrameComposition } from '../qualification-composition';
import type { AutoAssignProposal, ShiftViewItem } from '../schema';
import {
  deriveStaffingStatus,
  describeStaffing,
  formatStaffingText,
  type StaffingStatus,
} from '../staffing';
import { addDays } from '../view-utils';
import type { StagedRequirements } from './requirement-stage';
import type { StagedCell } from './shift-manager-types';
import { cellKey } from './shift-manager-utils';

/** 日付セル上部に表示する充足表示（数字・状態・Tooltip 文言）。 */
export type StaffingDisplay = {
  status: StaffingStatus;
  text: string;
  tooltip: string;
  /** 表示するアイコン。不足または資格構成の要確認なら警告、充足なら充足、それ以外は出さない。 */
  icon: 'warning' | 'filled' | null;
};

/** カレンダーイベントのペイロード。担当者イベントと、日付セル上部のヘッダー層に分かれる。 */
export type AssignmentEventPayload =
  | { kind: 'instructor'; date: string; instructorId: string }
  | {
      /** 日付セル上部に重ねるヘッダー層（未保存ドット・備考アイコン・充足表示） */
      kind: 'header';
      date: string;
      staged: boolean;
      status?: 'DRAFT' | 'PUBLISHED' | undefined;
      description: string;
      staffing: StaffingDisplay | null;
    };

/** ヘッダー層イベントのペイロード。 */
export type HeaderEventPayload = Extract<AssignmentEventPayload, { kind: 'header' }>;

/** MonthView が返すイベントのペイロードが、ヘッダー層のものかを判定する。 */
export function isHeaderEventPayload(payload: unknown): payload is HeaderEventPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'kind' in payload &&
    payload.kind === 'header'
  );
}

/** 日ごとの担当者（ID と表示名）。 */
export type DayAssignments = Map<string, Array<{ id: string; name: string }>>;

/**
 * 日ごとの担当者を解決する。ステージ済みならステージを、なければ保存済み Shift を使う。
 * ステージ済みの担当者名は「保存済み Shift → nameById → ID」の順で解決する。
 */
export function resolveAssignmentsByDay({
  days,
  shiftTypeId,
  shiftByCell,
  stagedCells,
  nameById,
}: {
  days: readonly string[];
  shiftTypeId: string;
  shiftByCell: ReadonlyMap<string, ShiftViewItem>;
  stagedCells: ReadonlyMap<string, StagedCell>;
  nameById: ReadonlyMap<string, string>;
}): DayAssignments {
  const map: DayAssignments = new Map();
  for (const day of days) {
    const key = cellKey(day, shiftTypeId);
    const serverShift = shiftByCell.get(key);
    const staged = stagedCells.get(key);
    const assigned = staged
      ? staged.instructorIds.map((id) => ({
          id,
          name:
            serverShift?.assignedInstructors.find((instructor) => instructor.id === id)
              ?.displayName ??
            nameById.get(id) ??
            id,
        }))
      : (serverShift?.assignedInstructors ?? []).map((instructor) => ({
          id: instructor.id,
          name: instructor.displayName,
        }));
    map.set(day, assigned);
  }
  return map;
}

/** 1日分の充足表示を作る。表示する数字がない日（未設定で配置0名）は null。 */
function buildStaffingDisplay({
  required,
  assigned,
  shortage,
  needsReview,
}: {
  required: number | null;
  assigned: number;
  shortage: AutoAssignProposal['shortage'] | undefined;
  /** 資格構成の要確認があるか（自動割当コンテキスト未取得の間は false） */
  needsReview: boolean;
}): StaffingDisplay | null {
  const text = formatStaffingText(required, assigned);
  if (text === null) return null;
  const status = deriveStaffingStatus(required, assigned);
  // 不足理由は、その後も不足のままの日にだけ補足として続ける
  const reason =
    status === 'SHORT' && shortage && shortage.count > 0 && shortage.reasons.length > 0
      ? shortage.reasons.join(' / ')
      : undefined;
  const described = describeStaffing(required, assigned);
  const label = needsReview ? `${described}、資格構成の確認が必要` : described;
  const icon =
    status === 'SHORT' || needsReview ? 'warning' : status === 'FILLED' ? 'filled' : null;
  return { status, text, tooltip: reason ? `${label}：${reason}` : label, icon };
}

/**
 * カレンダーに渡すイベント一覧を組み立てる。
 * 担当者イベントと、日ごとに1つの背景イベント（ヘッダー層）を返す。
 * ヘッダー層は未保存・備考・充足表示のいずれかがある日だけ作る。
 */
export function buildCalendarEvents({
  days,
  shiftTypeId,
  assignmentsByDay,
  shiftByCell,
  stagedCells,
  stagedRequirements,
  requiredByDay,
  shortageByCell,
  compositionByDay,
}: {
  days: readonly string[];
  shiftTypeId: string;
  assignmentsByDay: DayAssignments;
  shiftByCell: ReadonlyMap<string, ShiftViewItem>;
  stagedCells: ReadonlyMap<string, StagedCell>;
  stagedRequirements: StagedRequirements;
  /** 日 → 表示用の必要人数。取得前は null（充足表示を出さない）。 */
  requiredByDay: ReadonlyMap<string, number | null> | null;
  shortageByCell: ReadonlyMap<string, AutoAssignProposal['shortage']>;
  /** 日 → 資格構成の評価。自動割当コンテキストの取得前は null（要確認を判定しない）。 */
  compositionByDay: ReadonlyMap<string, FrameComposition> | null;
}): ScheduleEventData<AssignmentEventPayload>[] {
  const instructorEvents = days.flatMap((day) =>
    (assignmentsByDay.get(day) ?? []).map(
      (instructor): ScheduleEventData<AssignmentEventPayload> => ({
        id: `${day}:${shiftTypeId}:${instructor.id}`,
        title: instructor.name,
        start: `${day} 00:00:00`,
        end: `${addDays(day, 1)} 00:00:00`,
        color: 'gray',
        payload: { kind: 'instructor', date: day, instructorId: instructor.id },
      }),
    ),
  );
  const headerEvents = days.flatMap((day): ScheduleEventData<AssignmentEventPayload>[] => {
    const key = cellKey(day, shiftTypeId);
    const rawDescription =
      stagedCells.get(key)?.description ?? shiftByCell.get(key)?.description ?? '';
    const description = rawDescription.trim() ? rawDescription : '';
    const staged = stagedCells.has(key) || stagedRequirements.has(key);
    const staffing = requiredByDay
      ? buildStaffingDisplay({
          required: requiredByDay.get(day) ?? null,
          assigned: assignmentsByDay.get(day)?.length ?? 0,
          shortage: shortageByCell.get(key),
          needsReview: compositionByDay?.get(day)?.needsReview ?? false,
        })
      : null;
    const status = shiftByCell.get(key)?.status ?? (staged ? 'DRAFT' : undefined);
    if (!(staged || description || staffing || status)) return [];
    return [
      {
        id: `${day}:${shiftTypeId}:header`,
        title: description,
        start: `${day} 00:00:00`,
        end: `${addDays(day, 1)} 00:00:00`,
        color: 'gray',
        display: 'background',
        payload: { kind: 'header', date: day, staged, description, staffing, status },
      },
    ];
  });
  return [...instructorEvents, ...headerEvents];
}

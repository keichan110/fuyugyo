import type { DepartmentCode } from '@/features/departments/schema';

import type { AutoAssignProposal } from '../schema';
import type { ShiftManagerSelection } from './shift-manager-selection';

export type SelectedCell = ShiftManagerSelection;

/** 月次まとめ登録のステージ状態（cellKey → 変更内容） */
export type StagedCell = {
  instructorIds: string[];
  description: string;
};

/** 部門・対象月変更をユーザー承認で確定するための保留アクション */
export type PendingNavigation =
  | { type: 'department'; nextDepartmentCode: DepartmentCode }
  | { type: 'month'; nextMonth: string }
  | { type: 'shiftType'; nextShiftTypeId: string };

export type ShortageByCell = Map<string, AutoAssignProposal['shortage']>;

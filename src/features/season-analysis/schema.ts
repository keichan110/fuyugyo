import { z } from 'zod';

import { departmentCodeSchema } from '@/features/departments/schema';
import { dateStringSchema } from '@/features/shifts/schema';

/**
 * シーズン分析の境界スキーマ（isomorphic）。
 * サーバー（`api.ts`）の入出力検証とクライアント（`queries.ts`・`aggregators.ts`）で共有する。
 */

/** クエリ。`season` はシーズン開始年（例: 2026 → 2026/9〜2027/8） */
export const seasonAnalysisQuerySchema = z.object({
  season: z.coerce.number().int().min(2000).max(2100),
});

const seasonRangeSchema = z.object({ from: dateStringSchema, to: dateStringSchema });

/** 集計対象候補のインストラクター（資格のある部門コード付き） */
export const analysisInstructorSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  status: z.string(),
  /** 有効な資格を1つ以上持つ部門 */
  qualifiedDepartments: z.array(departmentCodeSchema),
});

/** 配置1件（インストラクター × 枠）。日付・部門・公開状態は枠由来 */
export const analysisAssignmentSchema = z.object({
  instructorId: z.string(),
  date: dateStringSchema,
  departmentCode: departmentCodeSchema,
  shiftTypeId: z.string(),
  shiftStatus: z.enum(['DRAFT', 'PUBLISHED']),
});

/** 枠1件（充足状況の集計用） */
export const analysisShiftSchema = z.object({
  date: dateStringSchema,
  departmentCode: departmentCodeSchema,
  shiftTypeId: z.string(),
  shiftTypeName: z.string(),
  requiredCount: z.number().int().nullable(),
  status: z.enum(['DRAFT', 'PUBLISHED']),
  assignedCount: z.number().int(),
});

/** 勤務可否の例外申告（UNAVAILABLE / AVOID のみ） */
export const analysisAvailabilityExceptionSchema = z.object({
  instructorId: z.string(),
  date: dateStringSchema,
  type: z.enum(['UNAVAILABLE', 'AVOID']),
});

/** シーズン分析の応答。集計前の事実データだけを返す */
export const seasonAnalysisSchema = z.object({
  seasonRange: seasonRangeSchema,
  today: dateStringSchema,
  instructors: z.array(analysisInstructorSchema),
  assignments: z.array(analysisAssignmentSchema),
  shifts: z.array(analysisShiftSchema),
  availabilityExceptions: z.array(analysisAvailabilityExceptionSchema),
});

export type SeasonAnalysis = z.infer<typeof seasonAnalysisSchema>;
export type AnalysisInstructor = z.infer<typeof analysisInstructorSchema>;
export type AnalysisAssignment = z.infer<typeof analysisAssignmentSchema>;
export type AnalysisShift = z.infer<typeof analysisShiftSchema>;
export type AnalysisAvailabilityException = z.infer<typeof analysisAvailabilityExceptionSchema>;

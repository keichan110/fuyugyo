import { z } from 'zod';

import { departmentCodeSchema } from '@/features/departments/schema';

/**
 * Shift / ShiftAssignment feature の境界スキーマ（isomorphic）。
 * サーバー（`api.ts`）の入出力検証とクライアント（`queries.ts`）の表示で共有する。
 * Shift は「日付 × 部門 × シフト種別」で一意な勤務枠で、複数 Instructor を
 * ShiftAssignment 経由で収容する（CONTEXT.md）。
 */

/** 日付文字列（YYYY-MM-DD）。Shift の一意キーの一部であり入力で共用する。 */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で指定してください');

/** 月文字列（YYYY-MM・月は 01〜12）。月次ビューの対象月指定に使う。 */
export const monthStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, '月は YYYY-MM 形式で指定してください')
  .refine((value) => {
    const month = Number(value.slice(5));
    return month >= 1 && month <= 12;
  }, '月は 01〜12 で指定してください');

/** Shift の単一レコード */
export const shiftSchema = z.object({
  id: z.string(),
  date: z.coerce.date(),
  departmentCode: departmentCodeSchema,
  shiftTypeId: z.string(),
  description: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Shift = z.infer<typeof shiftSchema>;

/** ShiftAssignment（割り当て）の単一レコード */
export const shiftAssignmentSchema = z.object({
  id: z.string(),
  shiftId: z.string(),
  instructorId: z.string(),
  assignedAt: z.coerce.date(),
});

export type ShiftAssignment = z.infer<typeof shiftAssignmentSchema>;

/** Shift 詳細（割り当て済み Instructor ID 付き） */
export const shiftWithAssignmentsSchema = shiftSchema.extend({
  assignedInstructorIds: z.array(z.string()),
});

export type ShiftWithAssignments = z.infer<typeof shiftWithAssignmentsSchema>;

/** Shift 一覧の1件（部門名・部門コード・シフト種別名を JOIN で同梱） */
export const shiftListItemSchema = shiftWithAssignmentsSchema.extend({
  departmentName: z.string(),
  shiftTypeName: z.string(),
});

export type ShiftListItem = z.infer<typeof shiftListItemSchema>;

/** Shift 一覧レスポンス（各 Shift に割り当て済み Instructor ID・部門名・シフト種別名を含む） */
export const shiftListSchema = z.array(shiftListItemSchema);

/** 月次まとめ upsert の1セル分（日付 × シフト種別の割り当て集合） */
export const monthlyAssignmentCellSchema = z.object({
  date: dateStringSchema,
  shiftTypeId: z.string().min(1),
  description: z.string().max(500).nullable().optional(),
  instructorIds: z.array(z.string().min(1)).default([]),
});

export type MonthlyAssignmentCell = z.infer<typeof monthlyAssignmentCellSchema>;

/**
 * 月単位で (date × 部門 × シフト種別) の割り当て集合をまとめて upsert する。
 * cells には保存したい変更差分のみを含める（含まれないセルは変更しない）。
 */
export const upsertMonthlyAssignmentsSchema = z.object({
  month: monthStringSchema,
  departmentCode: departmentCodeSchema,
  cells: z.array(monthlyAssignmentCellSchema),
});

export type UpsertMonthlyAssignmentsInput = z.infer<typeof upsertMonthlyAssignmentsSchema>;

/** 月次まとめ upsert レスポンス */
export const upsertMonthlyAssignmentsResultSchema = z.object({
  upsertedCount: z.number(),
  deletedCount: z.number(),
});

export type UpsertMonthlyAssignmentsResult = z.infer<typeof upsertMonthlyAssignmentsResultSchema>;

// ─── 自動割当 ───────────────────────────────────────────────────────────────

/** 可用性申告の入力状況。連携済みだが申告がない状態と、連携先がない状態を区別する。 */
export const availabilityStatusSchema = z.enum(['SUBMITTED', 'NOT_SUBMITTED', 'NOT_LINKED']);

/** 自動割当で評価する候補 Instructor。資格と可用性入力状況を同梱する。 */
export const autoAssignInstructorSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  certificationIds: z.array(z.string()),
  availabilityStatus: availabilityStatusSchema,
});

/** 部門内のシフト枠に設定された必要資格と、その資格を満たす候補。 */
export const autoAssignFrameSchema = z.object({
  shiftTypeId: z.string(),
  certificationTiers: z.array(
    z.object({ certificationId: z.string(), tierRank: z.number().int().positive() }),
  ),
  eligibleInstructorIds: z.array(z.string()),
});

/** 公平性と同日重複の判定に使う、保存済み Shift の割当集合。 */
export const autoAssignExistingAssignmentSchema = z.object({
  date: dateStringSchema,
  departmentCode: departmentCodeSchema,
  shiftTypeId: z.string(),
  instructorIds: z.array(z.string()),
});

/**
 * ブラウザ側の自動割当ソルバーが必要とする集約コンテキスト。
 * API と Web Worker から共有する isomorphic な入出力境界である。
 */
export const autoAssignContextSchema = z.object({
  departmentCode: departmentCodeSchema,
  period: z.object({ from: dateStringSchema, to: dateStringSchema }),
  instructors: z.array(autoAssignInstructorSchema),
  frames: z.array(autoAssignFrameSchema),
  availabilities: z.array(
    z.object({
      instructorId: z.string(),
      date: dateStringSchema,
      type: z.enum(['UNAVAILABLE', 'AVOID']),
      note: z.string().nullable(),
    }),
  ),
  existingAssignments: z.array(autoAssignExistingAssignmentSchema),
});

export type AutoAssignContext = z.infer<typeof autoAssignContextSchema>;

/** 自動割当を実行する対象種別・必要人数・対象日。DB には保存しない一時パラメータ。 */
export const autoAssignExecutionParamsSchema = z.object({
  shiftTypeId: z.string().min(1),
  weekdayRequiredCount: z.number().int().min(0),
  weekendHolidayRequiredCount: z.number().int().min(0),
  targetDates: z.array(dateStringSchema).min(1),
  holidayDates: z.array(dateStringSchema).default([]),
});

export type AutoAssignExecutionParams = z.infer<typeof autoAssignExecutionParamsSchema>;

/** 自動割当の1枠に対する提案結果。 */
export const autoAssignProposalSchema = z.object({
  date: dateStringSchema,
  shiftTypeId: z.string(),
  instructorIds: z.array(z.string()),
  shortage: z.object({ count: z.number().int().min(0), reasons: z.array(z.string()) }),
});

export type AutoAssignProposal = z.infer<typeof autoAssignProposalSchema>;

// ─── 集約（フォーム）データ ─────────────────────────────────────────────────

/** form-data の ShiftType 最小情報 */
const formShiftTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
});

/**
 * シフト作成フォームの初期表示データ（1リクエスト・N+1 なし）。
 * シフト種別一覧と、選択肢の規模を示す統計を含む。
 */
export const shiftFormDataSchema = z.object({
  shiftTypes: z.array(formShiftTypeSchema),
  stats: z.object({
    activeInstructorsCount: z.number(),
    totalShiftTypes: z.number(),
  }),
});

export type ShiftFormData = z.infer<typeof shiftFormDataSchema>;

/** edit-data の割り当て候補 Instructor（割り当て状態・競合状態・負荷の土台付き） */
const availableInstructorSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  displayNameKana: z.string().nullable(),
  status: z.string(),
  /** 保有資格の略称一覧 */
  certifications: z.array(z.string()),
  /** この Shift に既に割り当て済みか */
  isAssigned: z.boolean(),
  /** 同日の別 Shift に割り当て済みで競合しているか */
  hasConflict: z.boolean(),
  /** 資格要件がある枠で、既存割り当てだけが候補条件を満たさないか */
  hasQualificationWarning: z.boolean(),
  /**
   * 保存済みシーズン勤務日数のうち、対象月を除いた日数（全部門横断）。
   * 当月分（ステージ中の未保存編集を含む）はクライアント側でライブ計算し、
   * この値と合算して総勤務日数とする（月をまたぐ負荷もリアルタイム反映するため）。
   */
  seasonWorkDaysOutsideMonth: z.number(),
});

export type AvailableInstructor = z.infer<typeof availableInstructorSchema>;

/** edit-data の競合詳細（同日の別 Shift への二重割り当て） */
const conflictSchema = z.object({
  instructorId: z.string(),
  instructorName: z.string(),
  conflictingShift: z.object({
    id: z.string(),
    departmentName: z.string(),
    shiftTypeName: z.string(),
  }),
});

/**
 * シフト編集フォームの集約データ（1リクエスト・N+1 なし）。
 * 既存 Shift の有無で create/edit モードを判定し、対象部門の割り当て候補
 * Instructor（資格フィルタ済み・割り当て/競合状態付き）をまとめて返す。
 */
export const shiftEditDataSchema = z.object({
  mode: z.enum(['create', 'edit']),
  shift: z
    .object({
      id: z.string(),
      date: dateStringSchema,
      departmentCode: departmentCodeSchema,
      shiftTypeId: z.string(),
      description: z.string().nullable(),
      assignedInstructorIds: z.array(z.string()),
    })
    .nullable(),
  availableInstructors: z.array(availableInstructorSchema),
  conflicts: z.array(conflictSchema),
});

export type ShiftEditData = z.infer<typeof shiftEditDataSchema>;

// ─── 表示ビュー（週次/月次） ─────────────────────────────────────────────────

/** 表示ビューの割り当て済み Instructor（表示名のみ） */
const viewInstructorSchema = z.object({
  id: z.string(),
  displayName: z.string(),
});

/**
 * 表示ビューのシフト1件。部門・シフト種別・割り当て済み Instructor を同梱する。
 * 週次/月次ビューのカレンダー描画はこの形を直接消費する。
 */
export const shiftViewItemSchema = z.object({
  id: z.string(),
  /** 勤務日（YYYY-MM-DD・UTC 基準） */
  date: dateStringSchema,
  description: z.string().nullable(),
  department: z.object({
    name: z.string(),
    code: departmentCodeSchema,
  }),
  shiftType: z.object({ id: z.string(), name: z.string() }),
  assignedInstructors: z.array(viewInstructorSchema),
});

export type ShiftViewItem = z.infer<typeof shiftViewItemSchema>;

/**
 * 表示ビューのサマリ（集計）。件数・割り当て総数・対象期間・部門別件数を持つ。
 * 旧 usecases の集計レスポンスと同型で、純粋関数（aggregators）が組み立てる。
 */
export const shiftViewSummarySchema = z.object({
  /** 期間内のシフト枠数 */
  totalShifts: z.number(),
  /** 期間内の割り当て総数（Instructor 配置数の合計） */
  totalAssignments: z.number(),
  /** 対象期間（YYYY-MM-DD） */
  dateRange: z.object({ from: dateStringSchema, to: dateStringSchema }),
  /** 部門名 → シフト件数 */
  byDepartment: z.record(z.string(), z.number()),
});

export type ShiftViewSummary = z.infer<typeof shiftViewSummarySchema>;

/**
 * 週次/月次ビューのレスポンス（データ + 集計を1リクエストで同梱）。
 * 1リクエストで描画に必要なデータと統計を揃え、追加往復を不要にする。
 */
export const shiftViewResponseSchema = z.object({
  shifts: z.array(shiftViewItemSchema),
  summary: shiftViewSummarySchema,
});

export type ShiftViewResponse = z.infer<typeof shiftViewResponseSchema>;

// ─── アジェンダ表示 ────────────────────────────────────────────────────────

/** アジェンダのページング方向 */
export const shiftAgendaDirectionSchema = z.enum(['future', 'past']);

export type ShiftAgendaDirection = z.infer<typeof shiftAgendaDirectionSchema>;

/**
 * アジェンダの稼働日1日分。
 * 休校日は要素を生成せず、同じ日付の Shift だけを部門・シフト種別順で保持する。
 */
export const shiftAgendaDaySchema = z.object({
  date: dateStringSchema,
  shifts: z.array(shiftViewItemSchema),
});

export type ShiftAgendaDay = z.infer<typeof shiftAgendaDaySchema>;

/** アジェンダ範囲レスポンス */
export const shiftAgendaResponseSchema = z.object({
  days: z.array(shiftAgendaDaySchema),
  pageInfo: z.object({
    direction: shiftAgendaDirectionSchema,
    limit: z.number(),
    nextCursor: dateStringSchema.nullable(),
    previousCursor: dateStringSchema.nullable(),
  }),
});

export type ShiftAgendaResponse = z.infer<typeof shiftAgendaResponseSchema>;

import { z } from 'zod';

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

/** Shift の単一レコード */
export const shiftSchema = z.object({
  id: z.string(),
  date: z.coerce.date(),
  departmentId: z.string(),
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

/** Shift 一覧レスポンス（各 Shift に割り当て済み Instructor ID を含む） */
export const shiftListSchema = z.array(shiftWithAssignmentsSchema);

/** Shift 作成リクエスト */
export const createShiftSchema = z.object({
  /** 勤務日（YYYY-MM-DD） */
  date: dateStringSchema,
  /** 部門 ID */
  departmentId: z.string().min(1),
  /** シフト種別 ID */
  shiftTypeId: z.string().min(1),
  /** 備考（任意） */
  description: z.string().max(500).optional(),
  /** 割り当てる Instructor の ID 群（重複は無視され、空配列も可） */
  instructorIds: z.array(z.string().min(1)).default([]),
});

export type CreateShiftInput = z.infer<typeof createShiftSchema>;

/** Shift 更新リクエスト（少なくとも1フィールド必須） */
export const updateShiftSchema = z
  .object({
    /** 備考（null で消去） */
    description: z.string().max(500).nullable().optional(),
    /** 割り当てる Instructor の ID 群（指定時は割り当てを総入れ替えする） */
    instructorIds: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (v) => v.description !== undefined || v.instructorIds !== undefined,
    { message: '更新するフィールドを1つ以上指定してください' }
  );

export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;

// ─── 集約（フォーム）データ ─────────────────────────────────────────────────

/** form-data の Department 最小情報 */
const formDepartmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
});

/** form-data の ShiftType 最小情報 */
const formShiftTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
});

/**
 * シフト作成フォームの初期表示データ（1リクエスト・N+1 なし）。
 * 部門・シフト種別一覧と、選択肢の規模を示す統計を含む。
 */
export const shiftFormDataSchema = z.object({
  departments: z.array(formDepartmentSchema),
  shiftTypes: z.array(formShiftTypeSchema),
  stats: z.object({
    activeInstructorsCount: z.number(),
    totalDepartments: z.number(),
    totalShiftTypes: z.number(),
  }),
});

export type ShiftFormData = z.infer<typeof shiftFormDataSchema>;

/** edit-data の割り当て候補 Instructor（割り当て状態・競合状態付き） */
const availableInstructorSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  displayNameKana: z.string().nullable(),
  status: z.string(),
  /** 保有資格の略称をまとめた表示用文字列 */
  certificationSummary: z.string(),
  /** この Shift に既に割り当て済みか */
  isAssigned: z.boolean(),
  /** 同日の別 Shift に割り当て済みで競合しているか */
  hasConflict: z.boolean(),
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
      departmentId: z.string(),
      shiftTypeId: z.string(),
      description: z.string().nullable(),
      assignedInstructorIds: z.array(z.string()),
    })
    .nullable(),
  availableInstructors: z.array(availableInstructorSchema),
  conflicts: z.array(conflictSchema),
});

export type ShiftEditData = z.infer<typeof shiftEditDataSchema>;

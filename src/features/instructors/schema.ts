import { z } from 'zod';

/**
 * Instructor feature の境界スキーマ（isomorphic）。
 * サーバー（`api.ts`）の入出力検証とクライアント（`queries.ts`）の表示で共有する。
 */

/** インストラクターのステータス値 */
export const instructorStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export type InstructorStatus = z.infer<typeof instructorStatusSchema>;

/** Instructor の単一レコード */
export const instructorSchema = z.object({
  id: z.string(),
  lastName: z.string(),
  firstName: z.string(),
  lastNameKana: z.string().nullable(),
  firstNameKana: z.string().nullable(),
  status: instructorStatusSchema,
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Instructor = z.infer<typeof instructorSchema>;

/** Instructor 一覧レスポンス */
export const instructorListSchema = z.array(instructorSchema);

/** InstructorCertification（中間テーブル）の単一レコード */
export const instructorCertificationSchema = z.object({
  id: z.string(),
  instructorId: z.string(),
  certificationId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type InstructorCertification = z.infer<typeof instructorCertificationSchema>;

/** Instructor に紐付いた Certification 一覧 */
export const instructorCertificationListSchema = z.array(instructorCertificationSchema);

/** Instructor 詳細（Certification 一覧付き） */
export const instructorWithCertificationsSchema = instructorSchema.extend({
  certifications: instructorCertificationListSchema,
});

export type InstructorWithCertifications = z.infer<typeof instructorWithCertificationsSchema>;

/** 部門別アクティブ Instructor の Certification 情報（最低限） */
const deptCertSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
});

/** 部門別アクティブ Instructor（その部門の Certification 付き） */
export const activeInstructorInDepartmentSchema = instructorSchema.extend({
  certifications: z.array(deptCertSchema),
});

export type ActiveInstructorInDepartment = z.infer<typeof activeInstructorInDepartmentSchema>;

/** 部門別アクティブ Instructor 一覧レスポンス */
export const activeInstructorInDepartmentListSchema = z.array(activeInstructorInDepartmentSchema);

/** Instructor 作成リクエスト */
export const createInstructorSchema = z.object({
  /** 姓 */
  lastName: z.string().trim().min(1).max(50),
  /** 名 */
  firstName: z.string().trim().min(1).max(50),
  /** 姓（カナ） */
  lastNameKana: z.string().trim().max(50).optional(),
  /** 名（カナ） */
  firstNameKana: z.string().trim().max(50).optional(),
  notes: z.string().max(500).optional(),
});

export type CreateInstructorInput = z.infer<typeof createInstructorSchema>;

/** Instructor 更新リクエスト（少なくとも1フィールド必須） */
export const updateInstructorSchema = z
  .object({
    lastName: z.string().trim().min(1).max(50).optional(),
    firstName: z.string().trim().min(1).max(50).optional(),
    lastNameKana: z.string().trim().max(50).nullable().optional(),
    firstNameKana: z.string().trim().max(50).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine(
    (v) =>
      v.lastName !== undefined ||
      v.firstName !== undefined ||
      v.lastNameKana !== undefined ||
      v.firstNameKana !== undefined ||
      v.notes !== undefined,
    { message: '更新するフィールドを1つ以上指定してください' }
  );

export type UpdateInstructorInput = z.infer<typeof updateInstructorSchema>;

/** Instructor ステータス変更リクエスト */
export const changeInstructorStatusSchema = z.object({
  status: instructorStatusSchema,
});

export type ChangeInstructorStatusInput = z.infer<typeof changeInstructorStatusSchema>;

/** Certification 割り当てリクエスト */
export const assignCertificationSchema = z.object({
  certificationId: z.string().min(1),
});

export type AssignCertificationInput = z.infer<typeof assignCertificationSchema>;

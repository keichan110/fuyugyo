import { z } from 'zod';

import { departmentCodeSchema } from '@/features/departments/schema';

/**
 * Certification feature の境界スキーマ（isomorphic）。
 * サーバー（`api.ts`）の入出力検証とクライアント（`queries.ts`）の表示で共有する。
 */

/** Certification の単一レコード */
export const certificationSchema = z.object({
  id: z.string(),
  departmentCode: departmentCodeSchema,
  name: z.string(),
  shortName: z.string(),
  organization: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Certification = z.infer<typeof certificationSchema>;

/** Certification 一覧レスポンス */
export const certificationListSchema = z.array(certificationSchema);

/** Certification 作成リクエスト */
export const createCertificationSchema = z.object({
  /** 紐付け先の Department コード */
  departmentCode: departmentCodeSchema,
  /** 資格の正式名称 */
  name: z.string().trim().min(1).max(100),
  /** 省略表記（バッジ等に使用） */
  shortName: z.string().trim().min(1).max(20),
  /** 発行団体名 */
  organization: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
});

export type CreateCertificationInput = z.infer<typeof createCertificationSchema>;

/** Certification 更新リクエスト（departmentCode は変更不可・少なくとも1フィールド必須） */
export const updateCertificationSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    shortName: z.string().trim().min(1).max(20).optional(),
    organization: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.shortName !== undefined ||
      v.organization !== undefined ||
      v.description !== undefined,
    { message: '更新するフィールドを1つ以上指定してください' },
  );

export type UpdateCertificationInput = z.infer<typeof updateCertificationSchema>;

import { z } from 'zod';

/**
 * Department feature の境界スキーマ（isomorphic）。
 * サーバー（`api.ts`）の入出力検証とクライアント（`queries.ts`）の表示で共有する。
 */

/**
 * 部門コードの固定分類語彙（ADR 0011）。
 * 現時点では `departments` テーブルを廃止せず DB は不変のまま（コミット1）だが、
 * 視覚的アイデンティティ（色・アイコン・ラベル）はこの enum をキーにした
 * 全域マップ（`DepartmentTag.tsx`）で表現する。
 */
export const departmentCodeSchema = z.enum(['ski', 'snowboard']);

export type DepartmentCode = z.infer<typeof departmentCodeSchema>;

/** Department の単一レコード */
export const departmentSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type Department = z.infer<typeof departmentSchema>;

/** Department 一覧レスポンス */
export const departmentListSchema = z.array(departmentSchema);

/** Department 作成リクエスト */
export const createDepartmentSchema = z.object({
  /** スキー・スノーボード等の部門コード（ユニーク制約あり） */
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

/** Department 更新リクエスト（code 以外を更新可能・少なくとも1フィールド必須） */
export const updateDepartmentSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined, {
    message: '更新するフィールドを1つ以上指定してください',
  });

export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

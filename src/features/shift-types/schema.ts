import { z } from 'zod';

import { departmentCodeSchema } from '@/features/departments/schema';

/**
 * ShiftType feature の境界スキーマ（isomorphic）。
 * サーバー（`api.ts`）の入出力検証とクライアント（`queries.ts`）の表示で共有する。
 */

/** ShiftType の単一レコード */
export const shiftTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type ShiftType = z.infer<typeof shiftTypeSchema>;

/** カタログ一覧で返す、可用部門を含む ShiftType レコード */
export const shiftTypeListItemSchema = shiftTypeSchema.extend({
  availableDepartmentCodes: z.array(departmentCodeSchema),
});

export type ShiftTypeListItem = z.infer<typeof shiftTypeListItemSchema>;

/** ShiftType 一覧レスポンス */
export const shiftTypeListSchema = z.array(shiftTypeListItemSchema);

/** シフト種別名のフィールドスキーマ（作成・更新で共用） */
const nameField = z.string().trim().min(1).max(100);

/** ShiftType 作成リクエスト */
export const createShiftTypeSchema = z.object({
  /** シフト種別名（例: 終日、午前、午後） */
  name: nameField,
});

export type CreateShiftTypeInput = z.infer<typeof createShiftTypeSchema>;

/** ShiftType 更新リクエスト */
export const updateShiftTypeSchema = z.object({
  name: nameField,
});

export type UpdateShiftTypeInput = z.infer<typeof updateShiftTypeSchema>;

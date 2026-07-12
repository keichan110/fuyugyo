import { z } from 'zod';

import { createShiftTypeSchema } from '@/features/shift-types/schema';

/** 部門別シフト種別の取得レスポンス要素 */
export const departmentShiftTypeSchema = z.object({
  shiftTypeId: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});

export type DepartmentShiftType = z.infer<typeof departmentShiftTypeSchema>;

/** 部門別シフト種別の取得レスポンス */
export const departmentShiftTypeListSchema = z.array(departmentShiftTypeSchema);

/** 部門別シフト種別の一括更新リクエスト */
export const departmentShiftTypeUpdateSchema = z
  .object({
    shiftTypeIds: z.array(z.string().min(1)),
  })
  .refine(({ shiftTypeIds }) => new Set(shiftTypeIds).size === shiftTypeIds.length, {
    message: 'shiftTypeIds must not contain duplicates',
    path: ['shiftTypeIds'],
  });

export type DepartmentShiftTypeUpdateInput = z.infer<typeof departmentShiftTypeUpdateSchema>;

/** シフト種別を新規作成し、部門へ割り当てるリクエスト */
export const createDepartmentShiftTypeSchema = createShiftTypeSchema;

export type CreateDepartmentShiftTypeInput = z.infer<typeof createDepartmentShiftTypeSchema>;

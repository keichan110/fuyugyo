import { z } from "zod";
import {
  dateStringSchema,
  idSchema,
  optionalStringSchema,
} from "@/schemas/common";

/**
 * シフト作成スキーマ
 */
export const createShiftSchema = z.object({
  date: dateStringSchema,
  departmentId: idSchema,
  shiftTypeId: idSchema,
  description: optionalStringSchema,
  force: z.boolean().default(false),
  assignedInstructorIds: z.array(idSchema).default([]),
});

/**
 * シフト更新スキーマ
 */
export const updateShiftSchema = z.object({
  description: optionalStringSchema,
  assignedInstructorIds: z.array(idSchema).optional(),
});

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;

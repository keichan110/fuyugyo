import { z } from "zod";
import { isActiveSchema } from "@/schemas/common";

/**
 * シフト種別作成スキーマ
 */
export const createShiftTypeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  isActive: isActiveSchema,
});

/**
 * シフト種別更新スキーマ
 */
export const updateShiftTypeSchema = createShiftTypeSchema;

export type CreateShiftTypeInput = z.infer<typeof createShiftTypeSchema>;
export type UpdateShiftTypeInput = z.infer<typeof updateShiftTypeSchema>;

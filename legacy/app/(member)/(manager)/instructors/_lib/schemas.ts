import { z } from "zod";
import {
  idSchema,
  instructorStatusSchema,
  optionalStringSchema,
} from "@/schemas/common";

/**
 * インストラクター作成スキーマ
 */
export const createInstructorSchema = z.object({
  lastName: z.string().min(1, "Last name is required"),
  firstName: z.string().min(1, "First name is required"),
  lastNameKana: optionalStringSchema,
  firstNameKana: optionalStringSchema,
  status: instructorStatusSchema.default("ACTIVE"),
  notes: optionalStringSchema,
  certificationIds: z.array(idSchema).default([]),
});

/**
 * インストラクター更新スキーマ
 */
export const updateInstructorSchema = createInstructorSchema;

export type CreateInstructorInput = z.infer<typeof createInstructorSchema>;
export type UpdateInstructorInput = z.infer<typeof updateInstructorSchema>;

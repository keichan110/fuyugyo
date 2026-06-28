import { z } from "zod";
import {
  idSchema,
  isActiveSchema,
  optionalStringSchema,
} from "@/schemas/common";

/**
 * 資格作成スキーマ
 */
export const createCertificationSchema = z.object({
  departmentId: idSchema,
  name: z.string().min(1, "Name is required"),
  shortName: z.string().min(1, "Short name is required"),
  organization: z.string().min(1, "Organization is required"),
  description: optionalStringSchema,
  isActive: isActiveSchema,
});

/**
 * 資格更新スキーマ
 */
export const updateCertificationSchema = createCertificationSchema;

export type CreateCertificationInput = z.infer<
  typeof createCertificationSchema
>;
export type UpdateCertificationInput = z.infer<
  typeof updateCertificationSchema
>;

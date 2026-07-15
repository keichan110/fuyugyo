import { z } from 'zod';

/** 枠に紐づく資格と、枠内での相対的な序列 */
export const departmentShiftTypeCertificationSchema = z.object({
  certificationId: z.string().min(1),
  level: z.number().int(),
});

export type DepartmentShiftTypeCertification = z.infer<
  typeof departmentShiftTypeCertificationSchema
>;

/** 枠に紐づく資格序列の取得レスポンス */
export const departmentShiftTypeCertificationListSchema = z.array(
  departmentShiftTypeCertificationSchema,
);

/** 枠に紐づく資格序列を全置換するリクエスト */
export const departmentShiftTypeCertificationUpdateSchema = z
  .object({
    certifications: z.array(departmentShiftTypeCertificationSchema),
  })
  .refine(
    ({ certifications }) =>
      new Set(certifications.map((certification) => certification.certificationId)).size ===
      certifications.length,
    {
      message: 'certificationId must not contain duplicates',
      path: ['certifications'],
    },
  );

export type DepartmentShiftTypeCertificationUpdateInput = z.infer<
  typeof departmentShiftTypeCertificationUpdateSchema
>;

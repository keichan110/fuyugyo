import { z } from 'zod';

/** 枠に紐づく必要資格と、1を最上位とする枠内での相対的な資格レベル */
export const certificationRequirementSchema = z.object({
  certificationId: z.string().min(1),
  tierRank: z.number().int().positive(),
});

export type CertificationRequirement = z.infer<typeof certificationRequirementSchema>;

/** 枠に紐づく必要資格の取得レスポンス */
export const certificationRequirementListSchema = z.array(certificationRequirementSchema);

/** 枠に紐づく必要資格を全置換するリクエスト */
export const certificationRequirementUpdateSchema = z
  .object({
    certifications: z.array(certificationRequirementSchema),
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

export type CertificationRequirementUpdateInput = z.infer<
  typeof certificationRequirementUpdateSchema
>;

import { z } from 'zod';

import { dateStringSchema } from '@/features/shifts/schema';

/** 勤務可否の種別。勤務不可と要調整の二段階で申告する。 */
export const availabilityTypeSchema = z.enum(['UNAVAILABLE', 'AVOID']);

/** インストラクター1名・1日分の勤務可否申告。 */
export const availabilitySchema = z.object({
  instructorId: z.string(),
  date: dateStringSchema,
  type: availabilityTypeSchema,
  note: z.string().max(500).nullable(),
});

export type Availability = z.infer<typeof availabilitySchema>;

/** 管理者向け勤務可否一覧レスポンス。 */
export const availabilityListSchema = z.array(availabilitySchema);

/** 本人向け勤務可否一覧レスポンス。割当済みで編集不能な日も含む。 */
export const availabilityListResponseSchema = z.object({
  availabilities: availabilityListSchema,
  lockedDates: z.array(dateStringSchema),
});

/** 差分更新の1日分。`type: null` はその日の申告を削除する。 */
export const availabilityChangeSchema = z.object({
  date: dateStringSchema,
  type: availabilityTypeSchema.nullable(),
  note: z.string().max(500).nullable().optional(),
});

/** 本人の勤務可否を差分で更新するリクエスト。 */
export const updateMyAvailabilitiesSchema = z
  .object({ changes: z.array(availabilityChangeSchema) })
  .superRefine((value, ctx) => {
    const dates = new Set<string>();
    for (const [index, change] of value.changes.entries()) {
      if (dates.has(change.date)) {
        ctx.addIssue({
          code: 'custom',
          path: ['changes', index, 'date'],
          message: '同じ日付を重複して指定できません',
        });
      }
      dates.add(change.date);
    }
  });

export type UpdateMyAvailabilitiesInput = z.infer<typeof updateMyAvailabilitiesSchema>;

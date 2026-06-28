/**
 * Shifts API バリデーションスキーマ
 */

import { z } from "zod";
import {
  createDateRangeSchema,
  positiveIntSchema,
  shiftSchema,
  shiftTypeSchema,
} from "./validation-utils";

/**
 * シフト作成バリデーションスキーマ
 */
export const createShiftSchema = shiftSchema.extend({
  // 過去の日付は作成不可
  date: createDateRangeSchema(new Date()),
  // 重複シフトの強制作成フラグ（オプション）
  force: z.boolean().optional().default(false),
});

/**
 * シフト更新バリデーションスキーマ
 */
export const updateShiftSchema = shiftSchema.partial().extend({
  id: positiveIntSchema,
});

/**
 * シフト削除バリデーションスキーマ
 */
export const deleteShiftSchema = z.object({
  id: positiveIntSchema,
});

/**
 * シフト種別作成バリデーションスキーマ
 */
export const createShiftTypeSchema = shiftTypeSchema;

/**
 * シフト種別更新バリデーションスキーマ
 */
export const updateShiftTypeSchema = shiftTypeSchema.partial().extend({
  id: positiveIntSchema,
});

/**
 * シフト検索クエリパラメータバリデーションスキーマ
 */
const PER_PAGE_MAX = 100;
const PER_PAGE_DEFAULT = 20;
// biome-ignore lint/style/noMagicNumbers: 1日のミリ秒換算を明示したい
const MILLISECONDS_IN_DAY = 1000 * 60 * 60 * 24;
const MAX_DAYS_IN_YEAR = 366;
const MIN_YEAR = 2020;
const MAX_YEAR = 2030;
const MIN_MONTH = 1;
const MAX_MONTH = 12;

export const shiftQuerySchema = z
  .object({
    // 基本パラメータ
    page: z.coerce.number().int().positive().optional().default(1),
    perPage: z.coerce
      .number()
      .int()
      .min(1)
      .max(PER_PAGE_MAX)
      .optional()
      .default(PER_PAGE_DEFAULT),
    sortBy: z
      .enum(["date", "createdAt", "updatedAt"])
      .optional()
      .default("date"),
    sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),

    // 日付範囲
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),

    // フィルター
    departmentId: z.coerce.number().int().positive().optional(),
    shiftTypeId: z.coerce.number().int().positive().optional(),
    instructorId: z.coerce.number().int().positive().optional(),
    includeAssignments: z.coerce.boolean().optional().default(false),
    includeInactive: z.coerce.boolean().optional().default(false),
  })
  .refine(
    (data) =>
      !(data.startDate && data.endDate) || data.startDate <= data.endDate,
    {
      message: "終了日は開始日以降である必要があります",
      path: ["endDate"],
    }
  )
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        const diffTime = data.endDate.getTime() - data.startDate.getTime();
        const diffDays = diffTime / MILLISECONDS_IN_DAY;
        return diffDays <= MAX_DAYS_IN_YEAR; // 1年以内
      }
      return true;
    },
    {
      message: "検索期間は1年以内に設定してください",
      path: ["endDate"],
    }
  );

/**
 * カレンダー表示クエリパラメータバリデーションスキーマ
 */
export const calendarQuerySchema = z.object({
  year: z.coerce.number().int().min(MIN_YEAR).max(MAX_YEAR),
  month: z.coerce.number().int().min(MIN_MONTH).max(MAX_MONTH),
  departmentId: z.coerce.number().int().positive().optional(),
  view: z.enum(["month", "week", "day"]).optional().default("month"),
});

/**
 * 週表示クエリパラメータバリデーションスキーマ
 */
export const weeklyQuerySchema = z
  .object({
    startDate: z.coerce.date(),
    departmentId: z.coerce.number().int().positive().optional(),
  })
  .refine(
    (data) => {
      // 月曜日であることを確認
      const dayOfWeek = data.startDate.getDay();
      return dayOfWeek === 1; // 月曜日 = 1
    },
    {
      message: "開始日は月曜日である必要があります",
      path: ["startDate"],
    }
  );

/**
 * シフト割り当てバリデーションスキーマ
 */
export const shiftAssignmentSchema = z.object({
  shiftId: positiveIntSchema,
  instructorId: positiveIntSchema,
});

/**
 * 一括シフト割り当てバリデーションスキーマ
 */
export const bulkShiftAssignmentSchema = z.object({
  shiftId: positiveIntSchema,
  instructorIds: z
    .array(positiveIntSchema)
    .min(1, "最低1人のインストラクターを選択してください")
    .max(10, "インストラクターは最大10人まで選択できます"),
});

/**
 * シフト割り当て解除バリデーションスキーマ
 */
export const unassignShiftSchema = z.object({
  shiftId: positiveIntSchema,
  instructorId: positiveIntSchema,
});

/**
 * URL パラメータバリデーションスキーマ
 */
export const shiftIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const instructorIdParamSchema = z.object({
  instructorId: z.coerce.number().int().positive(),
});

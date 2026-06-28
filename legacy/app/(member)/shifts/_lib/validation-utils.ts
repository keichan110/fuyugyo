/**
 * 共通バリデーションユーティリティ
 * Zodを使用した型安全なバリデーション
 */

import { z } from "zod";
import type { ValidationError } from "@/types/common";
import { failure, type Result, success } from "@/types/result";

/**
 * 共通のバリデーションスキーマ
 */

// 基本型
export const positiveIntSchema = z
  .number()
  .int()
  .positive({ message: "正の整数を入力してください" });
export const nonEmptyStringSchema = z
  .string()
  .min(1, { message: "必須項目です" });

// 日本語名のバリデーション
export const japaneseNameSchema = z
  .string()
  .min(1, { message: "名前を入力してください" })
  // biome-ignore lint/style/noMagicNumbers: バリデーション制約のため
  .max(50, { message: "名前は50文字以下で入力してください" })
  .regex(/^[ぁ-んァ-ヶ一-龯々〆〤\s]+$/, {
    message: "有効な日本語名を入力してください",
  });

// カナ名のバリデーション
export const katakanaSchema = z
  .string()
  // biome-ignore lint/style/noMagicNumbers: バリデーション制約のため
  .max(50, { message: "カナは50文字以下で入力してください" })
  .regex(/^[ァ-ヶー\s]*$/, { message: "カタカナで入力してください" })
  .optional();

// 電話番号のバリデーション
export const phoneSchema = z
  .string()
  .regex(/^[\d\-()+\s]+$/, { message: "有効な電話番号を入力してください" })
  .optional();

// メールアドレスのバリデーション
export const emailSchema = z
  .string()
  .email({ message: "有効なメールアドレスを入力してください" })
  .optional();

/**
 * 日付関連のバリデーション
 */

// 日付の範囲バリデーション
export const createDateRangeSchema = (minDate?: Date, maxDate?: Date) => {
  let schema = z.date({ message: "有効な日付を入力してください" });

  if (minDate) {
    schema = schema.min(minDate, {
      message: `${minDate.toLocaleDateString()}以降の日付を選択してください`,
    });
  }

  if (maxDate) {
    schema = schema.max(maxDate, {
      message: `${maxDate.toLocaleDateString()}以前の日付を選択してください`,
    });
  }

  return schema;
};

// 営業時間のバリデーション
export const timeSlotSchema = z
  .object({
    start: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
      message: "有効な時刻を入力してください (HH:MM)",
    }),
    end: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
      message: "有効な時刻を入力してください (HH:MM)",
    }),
  })
  .refine((data) => data.start < data.end, {
    message: "終了時刻は開始時刻より後である必要があります",
    path: ["end"],
  });

/**
 * ドメイン固有のバリデーションスキーマ
 */

// 部門バリデーション
export const departmentSchema = z.object({
  code: z
    .string()
    .min(1, { message: "部門コードは必須です" })
    // biome-ignore lint/style/noMagicNumbers: バリデーション制約のため
    .max(20, { message: "部門コードは20文字以下で入力してください" })
    .regex(/^[A-Za-z0-9_-]+$/, {
      message: "部門コードは英数字、アンダースコア、ハイフンのみ使用できます",
    }),
  // biome-ignore lint/style/noMagicNumbers: バリデーション制約のため
  name: nonEmptyStringSchema.max(100, {
    message: "部門名は100文字以下で入力してください",
  }),
  description: z
    .string()
    // biome-ignore lint/style/noMagicNumbers: バリデーション制約のため
    .max(500, { message: "説明は500文字以下で入力してください" })
    .optional(),
  isActive: z.boolean().default(true),
});

// インストラクターバリデーション
export const instructorSchema = z.object({
  lastName: japaneseNameSchema,
  firstName: japaneseNameSchema,
  lastNameKana: katakanaSchema,
  firstNameKana: katakanaSchema,
  status: z.enum(["ACTIVE", "INACTIVE", "RETIRED"]).default("ACTIVE"),
  notes: z
    .string()
    // biome-ignore lint/style/noMagicNumbers: バリデーション制約のため
    .max(1000, { message: "メモは1000文字以下で入力してください" })
    .optional(),
});

// 資格バリデーション
export const certificationSchema = z.object({
  departmentId: positiveIntSchema,
  // biome-ignore lint/style/noMagicNumbers: バリデーション制約のため
  name: nonEmptyStringSchema.max(100, {
    message: "資格名は100文字以下で入力してください",
  }),
  // biome-ignore lint/style/noMagicNumbers: バリデーション制約のため
  shortName: nonEmptyStringSchema.max(20, {
    message: "略称は20文字以下で入力してください",
  }),
  // biome-ignore lint/style/noMagicNumbers: バリデーション制約のため
  organization: nonEmptyStringSchema.max(100, {
    message: "認定団体は100文字以下で入力してください",
  }),
  description: z
    .string()
    // biome-ignore lint/style/noMagicNumbers: バリデーション制約のため
    .max(500, { message: "説明は500文字以下で入力してください" })
    .optional(),
  isActive: z.boolean().default(true),
});

// シフト種別バリデーション
export const shiftTypeSchema = z.object({
  // biome-ignore lint/style/noMagicNumbers: バリデーション制約のため
  name: nonEmptyStringSchema.max(50, {
    message: "シフト種別名は50文字以下で入力してください",
  }),
  isActive: z.boolean().default(true),
});

// シフトバリデーション
export const shiftSchema = z.object({
  date: z.date({ message: "日付は必須です" }),
  departmentId: positiveIntSchema,
  shiftTypeId: positiveIntSchema,
  description: z
    .string()
    // biome-ignore lint/style/noMagicNumbers: バリデーション制約のため
    .max(500, { message: "説明は500文字以下で入力してください" })
    .optional(),
});

/**
 * バリデーション実行ヘルパー関数
 */

/**
 * スキーマに対してデータを検証し、Result型で結果を返す
 */
export const validateData = <T>(
  schema: z.ZodSchema<T>,
  data: unknown
): Result<T, ValidationError[]> => {
  const result = schema.safeParse(data);

  if (result.success) {
    return success(result.data);
  }

  const errors: ValidationError[] = result.error.issues.map((error) => ({
    field: error.path.join("."),
    message: error.message,
    code: error.code,
  }));

  return failure(errors);
};

/**
 * 複数のスキーマを並列で検証
 */
export const validateMultiple = async <T extends Record<string, unknown>>(
  validations: {
    [K in keyof T]: { schema: z.ZodSchema<T[K]>; data: unknown };
  }
): Promise<Result<T, ValidationError[]>> => {
  const results = await Promise.all(
    Object.entries(validations).map(async ([key, { schema, data }]) => ({
      key: key as keyof T,
      result: validateData(schema, data),
    }))
  );

  const errors: ValidationError[] = [];
  const validData = {} as T;

  for (const { key, result } of results) {
    if (result.success) {
      validData[key] = result.data as T[keyof T];
    } else {
      errors.push(
        ...result.error.map((error) => ({
          ...error,
          field: `${String(key)}.${error.field}`,
        }))
      );
    }
  }

  return errors.length > 0 ? failure(errors) : success(validData);
};

/**
 * フォームデータのバリデーション
 */
export const validateFormData = <T>(
  schema: z.ZodSchema<T>,
  formData: FormData | Record<string, unknown>
): Result<T, ValidationError[]> => {
  let data: Record<string, unknown>;

  if (formData instanceof FormData) {
    data = {};
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }
  } else {
    data = formData;
  }

  return validateData(schema, data);
};

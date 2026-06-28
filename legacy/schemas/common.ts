import { z } from "zod";

/**
 * 日付文字列スキーマ (YYYY-MM-DD)
 * ISO 8601 形式の日付文字列を検証
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   date: dateStringSchema,
 * });
 * schema.parse({ date: '2024-01-15' }); // OK
 * schema.parse({ date: '2024/01/15' }); // Error
 * ```
 */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format. Expected YYYY-MM-DD");

/**
 * CUID文字列IDスキーマ
 * データベースのCUID形式のIDを検証
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   id: idSchema,
 * });
 * schema.parse({ id: 'ckxxx...' }); // OK
 * schema.parse({ id: '' }); // Error (must not be empty)
 * schema.parse({ id: 123 }); // Error (must be string)
 * ```
 */
export const idSchema = z.string().min(1, "ID is required");

/**
 * オプショナルな文字列（空文字をnullに変換）
 * フォームの任意入力フィールドなどで使用
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   description: optionalStringSchema,
 * });
 * schema.parse({ description: 'text' }); // { description: 'text' }
 * schema.parse({ description: '' }); // { description: null }
 * schema.parse({ description: null }); // { description: null }
 * schema.parse({}); // { description: null }
 * ```
 */
export const optionalStringSchema = z
  .string()
  .nullable()
  .optional()
  .transform((val) => val || null);

/**
 * アクティブ状態スキーマ
 * リソースの有効/無効状態を管理
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   isActive: isActiveSchema,
 * });
 * schema.parse({}); // { isActive: true } (デフォルト)
 * schema.parse({ isActive: false }); // { isActive: false }
 * ```
 */
export const isActiveSchema = z.boolean().default(true);

/**
 * ステータス列挙型（instructors用）
 * インストラクターの勤務状態を管理
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   status: instructorStatusSchema,
 * });
 * schema.parse({ status: 'ACTIVE' }); // OK
 * schema.parse({ status: 'INVALID' }); // Error
 * ```
 */
export const instructorStatusSchema = z.enum(["ACTIVE", "INACTIVE", "RETIRED"]);

import type { ValidationError } from "./types";

// 正規表現パターン（トップレベル定義）
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// バリデーション定数
const MAX_LENGTH_NAME = 50;
const MAX_LENGTH_NOTES = 500;

/**
 * バリデーション結果
 */
export type ValidationResult = {
  readonly isValid: boolean;
  readonly errors: ValidationError[];
};

/**
 * バリデーション関数の型
 */
export type ValidatorFunction<T = unknown> = (
  value: T,
  field?: string
) => ValidationError[];

/**
 * 必須フィールドバリデーター
 */
export const required: ValidatorFunction = (
  value: unknown,
  field = "field"
) => {
  if (value === null || value === undefined || value === "") {
    return [
      {
        field,
        message: `${field} is required`,
        code: "REQUIRED",
      },
    ];
  }
  return [];
};

/**
 * 文字列長バリデーター
 */
export const minLength =
  (minLen: number): ValidatorFunction<string> =>
  (value, field = "field") => {
    if (typeof value === "string" && value.length < minLen) {
      return [
        {
          field,
          message: `${field} must be at least ${minLen} characters long`,
          code: "MIN_LENGTH",
        },
      ];
    }
    return [];
  };

export const maxLength =
  (maxLen: number): ValidatorFunction<string> =>
  (value, field = "field") => {
    if (typeof value === "string" && value.length > maxLen) {
      return [
        {
          field,
          message: `${field} must be at most ${maxLen} characters long`,
          code: "MAX_LENGTH",
        },
      ];
    }
    return [];
  };

/**
 * 数値範囲バリデーター
 */
export const min =
  (minValue: number): ValidatorFunction<number> =>
  (value, field = "field") => {
    if (typeof value === "number" && value < minValue) {
      return [
        {
          field,
          message: `${field} must be at least ${minValue}`,
          code: "MIN_VALUE",
        },
      ];
    }
    return [];
  };

export const max =
  (maxValue: number): ValidatorFunction<number> =>
  (value, field = "field") => {
    if (typeof value === "number" && value > maxValue) {
      return [
        {
          field,
          message: `${field} must be at most ${maxValue}`,
          code: "MAX_VALUE",
        },
      ];
    }
    return [];
  };

/**
 * 型バリデーター
 */
export const isString: ValidatorFunction = (value, field = "field") => {
  if (typeof value !== "string") {
    return [
      {
        field,
        message: `${field} must be a string`,
        code: "INVALID_TYPE",
      },
    ];
  }
  return [];
};

export const isNumber: ValidatorFunction = (value, field = "field") => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return [
      {
        field,
        message: `${field} must be a number`,
        code: "INVALID_TYPE",
      },
    ];
  }
  return [];
};

export const isBoolean: ValidatorFunction = (value, field = "field") => {
  if (typeof value !== "boolean") {
    return [
      {
        field,
        message: `${field} must be a boolean`,
        code: "INVALID_TYPE",
      },
    ];
  }
  return [];
};

/**
 * 日付バリデーター
 */
export const isDate: ValidatorFunction = (value, field = "field") => {
  if (typeof value !== "string" || !DATE_REGEX.test(value)) {
    return [
      {
        field,
        message: `${field} must be a valid date in YYYY-MM-DD format`,
        code: "INVALID_DATE",
      },
    ];
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return [
      {
        field,
        message: `${field} must be a valid date`,
        code: "INVALID_DATE",
      },
    ];
  }

  return [];
};

/**
 * 列挙型バリデーター
 */
export const isOneOf =
  <T>(validValues: T[]): ValidatorFunction<T> =>
  (value, field = "field") => {
    if (!validValues.includes(value)) {
      return [
        {
          field,
          message: `${field} must be one of: ${validValues.join(", ")}`,
          code: "INVALID_VALUE",
        },
      ];
    }
    return [];
  };

/**
 * 配列バリデーター
 */
export const isArray: ValidatorFunction = (value, field = "field") => {
  if (!Array.isArray(value)) {
    return [
      {
        field,
        message: `${field} must be an array`,
        code: "INVALID_TYPE",
      },
    ];
  }
  return [];
};

export const arrayOf =
  (itemValidator: ValidatorFunction): ValidatorFunction =>
  (value, field = "field") => {
    if (!Array.isArray(value)) {
      return [
        {
          field,
          message: `${field} must be an array`,
          code: "INVALID_TYPE",
        },
      ];
    }

    const errors: ValidationError[] = [];
    for (const [index, item] of value.entries()) {
      const itemErrors = itemValidator(item, `${field}[${index}]`);
      errors.push(...itemErrors);
    }

    return errors;
  };

/**
 * バリデーションスキーマ
 */
export type ValidationSchema = {
  // biome-ignore lint/suspicious/noExplicitAny: バリデーターは様々な型を受け入れる必要があるため
  [field: string]: ValidatorFunction<any>[];
};

/**
 * スキーマベースバリデーション
 */
export function validate(
  data: Record<string, unknown>,
  schema: ValidationSchema
): ValidationResult {
  const errors: ValidationError[] = [];

  for (const [field, validators] of Object.entries(schema)) {
    const value = data[field];

    for (const validator of validators) {
      const fieldErrors = validator(value, field);
      errors.push(...fieldErrors);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 必須フィールドチェック
 */
export function checkRequiredFields(
  data: Record<string, unknown>,
  requiredFields: string[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const field of requiredFields) {
    const value = data[field];
    if (value === undefined || value === null || value === "") {
      errors.push({
        field,
        message: `${field} is required`,
        code: "REQUIRED",
      });
    }
  }

  return errors;
}

/**
 * よく使われるバリデーションスキーマ
 */
export const commonSchemas: { [key: string]: ValidationSchema } = {
  // インストラクター作成
  createInstructor: {
    lastName: [required, isString, maxLength(MAX_LENGTH_NAME)],
    firstName: [required, isString, maxLength(MAX_LENGTH_NAME)],
    lastNameKana: [isString, maxLength(MAX_LENGTH_NAME)],
    firstNameKana: [isString, maxLength(MAX_LENGTH_NAME)],
    status: [isOneOf(["ACTIVE", "INACTIVE", "RETIRED"])],
    notes: [isString, maxLength(MAX_LENGTH_NOTES)],
    certificationIds: [isArray, arrayOf(isNumber)],
  },

  // シフト作成
  createShift: {
    date: [required, isDate],
    departmentId: [required, isNumber, min(1)],
    shiftTypeId: [required, isNumber, min(1)],
    description: [isString, maxLength(MAX_LENGTH_NOTES)],
    assignedInstructorIds: [isArray, arrayOf(isNumber)],
  },
};

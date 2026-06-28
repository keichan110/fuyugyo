import { NextResponse } from "next/server";
import {
  type ApiErrorResponse,
  ApiErrorType,
  type ApiSuccessResponse,
  HttpStatus,
  type ValidationError,
} from "./types";

/**
 * 成功レスポンスを作成
 */
export function createSuccessResponse<T>(
  data: T,
  options: {
    message?: string;
    count?: number;
    status?: HttpStatus;
  } = {}
): NextResponse<ApiSuccessResponse<T>> {
  const { message = null, count, status = HttpStatus.OK } = options;

  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(count !== undefined && { count }),
    message,
    error: null,
  };

  return NextResponse.json(response, { status });
}

/**
 * エラーレスポンスを作成
 */
export function createErrorResponse(
  error: string,
  options: {
    type?: ApiErrorType;
    status?: HttpStatus;
    details?: Record<string, unknown>;
  } = {}
): NextResponse<ApiErrorResponse> {
  const { status = HttpStatus.INTERNAL_SERVER_ERROR } = options;

  const response: ApiErrorResponse = {
    success: false,
    data: null,
    message: null,
    error,
  };

  return NextResponse.json(response, { status });
}

/**
 * バリデーションエラーレスポンスを作成
 */
export function createValidationErrorResponse(
  errors: ValidationError[]
): NextResponse<ApiErrorResponse> {
  const errorMessage = `Validation failed: ${errors.map((e) => e.message).join(", ")}`;

  return createErrorResponse(errorMessage, {
    type: ApiErrorType.VALIDATION_ERROR,
    status: HttpStatus.BAD_REQUEST,
    details: { validationErrors: errors },
  });
}

/**
 * 404 Not Found レスポンスを作成
 */
export function createNotFoundResponse(
  resource = "Resource"
): NextResponse<ApiErrorResponse> {
  return createErrorResponse(`${resource} not found`, {
    type: ApiErrorType.NOT_FOUND,
    status: HttpStatus.NOT_FOUND,
  });
}

/**
 * 409 Conflict レスポンスを作成
 */
export function createConflictResponse(
  message: string
): NextResponse<ApiErrorResponse> {
  return createErrorResponse(message, {
    type: ApiErrorType.CONFLICT,
    status: HttpStatus.CONFLICT,
  });
}

/**
 * 内部エラーレスポンスを作成（ログ付き）
 */
export function createInternalErrorResponse(
  error: unknown,
  context?: string
): NextResponse<ApiErrorResponse> {
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  const _logMessage = context ? `${context}: ${errorMessage}` : errorMessage;

  return createErrorResponse("Internal server error", {
    type: ApiErrorType.INTERNAL_ERROR,
    status: HttpStatus.INTERNAL_SERVER_ERROR,
  });
}

/**
 * 必須フィールドチェックエラーを作成
 */
export function createMissingFieldsResponse(
  missingFields: string[]
): NextResponse<ApiErrorResponse> {
  const errors: ValidationError[] = missingFields.map((field) => ({
    field,
    message: `${field} is required`,
    code: "REQUIRED_FIELD",
  }));

  return createValidationErrorResponse(errors);
}

/**
 * APIレスポンスラッパー - try-catchでの簡単なエラーハンドリング
 */
export async function withApiErrorHandling<T>(
  operation: () => Promise<NextResponse<T>>,
  context?: string
): Promise<NextResponse<T> | NextResponse<ApiErrorResponse>> {
  try {
    return await operation();
  } catch (error) {
    return createInternalErrorResponse(error, context);
  }
}

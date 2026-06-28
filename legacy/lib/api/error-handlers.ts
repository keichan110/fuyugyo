import { secureLog } from "@/lib/utils/logging";

/**
 * API エラーログヘルパー関数
 *
 * @description
 * API ルートハンドラーで発生したエラーを構造化されたログとして記録します。
 * 各 API エンドポイントで統一されたエラーログフォーマットを提供します。
 *
 * @param context - エラーが発生したコンテキストの説明（例: "Failed to fetch shift edit data"）
 * @param error - キャッチされたエラーオブジェクト
 *
 * @example
 * ```typescript
 * try {
 *   // API処理
 * } catch (error) {
 *   logApiError("Failed to fetch shift edit data", error);
 *   return NextResponse.json({ error: "Internal server error" }, { status: 500 });
 * }
 * ```
 */
export function logApiError(context: string, error: unknown): void {
  secureLog("error", `[API Error] ${context}`, {
    error: error instanceof Error ? error.message : "Unknown error occurred",
    stack: error instanceof Error ? error.stack : undefined,
  });
}

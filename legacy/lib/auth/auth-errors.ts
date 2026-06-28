/**
 * 認証エラー用カスタム例外クラス
 * 未認証状態（ログインしていない）を示すエラー
 *
 * @example
 * ```typescript
 * const user = await authenticate();
 * if (!user) {
 *   throw new UnauthorizedError();
 * }
 * ```
 */
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * 権限不足エラー用カスタム例外クラス
 * 認証済みだが、必要な権限を持っていない状態を示すエラー
 *
 * @example
 * ```typescript
 * if (user.role !== "ADMIN") {
 *   throw new ForbiddenError("Admin access required");
 * }
 * ```
 */
export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

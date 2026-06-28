"use server";
import { authenticateFromCookies } from "@/lib/auth/middleware";
import type { AuthenticatedUser } from "@/types/actions";

/**
 * Server Actions 用の認証ヘルパー
 * Cookie から JWT トークンを取得して検証し、データベースから最新のユーザー情報を返す
 *
 * セキュリティ重要: JWT ペイロードだけでなく、必ずデータベースで最新の isActive と role を確認します
 * これにより、無効化されたユーザーや権限変更後のユーザーが古いトークンで操作を継続できないようにします
 *
 * @returns 認証済みユーザー情報、または null（未認証の場合）
 *
 * @example
 * ```typescript
 * export async function myAction() {
 *   const user = await authenticate();
 *   if (!user) {
 *     return { success: false, error: 'Unauthorized' };
 *   }
 *   // 認証済みの処理...
 * }
 * ```
 */
export async function authenticate(): Promise<AuthenticatedUser | null> {
  try {
    const result = await authenticateFromCookies();

    if (!(result.success && result.user)) {
      return null;
    }

    // データベースから取得した最新のユーザー情報を返す
    return {
      id: result.user.id,
      lineUserId: result.user.lineUserId,
      displayName: result.user.displayName,
      pictureUrl: result.user.pictureUrl ?? null,
      role: result.user.role,
      instructorId: result.user.instructorId ?? null,
      isActive: result.user.isActive,
      createdAt: result.user.createdAt,
      updatedAt: result.user.updatedAt,
    };
  } catch {
    // 認証フロー内での例外は認証失敗として扱う
    return null;
  }
}

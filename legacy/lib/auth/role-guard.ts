"use server";
import type { AuthenticatedUser } from "@/types/actions";
import { authenticate } from "./auth";
import { ForbiddenError, UnauthorizedError } from "./auth-errors";

/**
 * ロール型定義
 */
type Role = "MEMBER" | "MANAGER" | "ADMIN";

/**
 * ロール優先度定義
 * 数値が大きいほど高い権限を表す
 */
const ROLE_PRIORITY: Record<Role, number> = {
  MEMBER: 0,
  MANAGER: 1,
  ADMIN: 2,
} as const;

/**
 * ロール要件定義
 */
type RoleRequirement = {
  /** 必要最小権限 */
  atLeast: Role;
};

/**
 * ロールチェック結果型
 */
export type RoleCheckResult =
  | { status: "authorized"; user: AuthenticatedUser }
  | { status: "unauthenticated" }
  | { status: "forbidden"; user: AuthenticatedUser };

/**
 * ロール要件チェック（Result型）
 * レイアウトやServer Componentsでの認可判定に使用
 *
 * @param requirement - ロール要件（atLeast: 必要最小権限）
 * @returns ロールチェック結果（authorized/unauthenticated/forbidden）
 *
 * @example
 * ```typescript
 * export default async function ManagerLayout({ children }: Props) {
 *   const result = await ensureRole({ atLeast: "MANAGER" });
 *   if (result.status === "unauthenticated") {
 *     redirect(buildLoginRedirectUrl());
 *   }
 *   if (result.status === "forbidden") {
 *     redirect(ACCESS_DENIED_REDIRECT);
 *   }
 *   return <>{children}</>;
 * }
 * ```
 */
export async function ensureRole(
  requirement: RoleRequirement
): Promise<RoleCheckResult> {
  const user = await authenticate();
  if (!user) {
    return { status: "unauthenticated" };
  }

  const isAllowed =
    ROLE_PRIORITY[user.role] >= ROLE_PRIORITY[requirement.atLeast];
  if (!isAllowed) {
    return { status: "forbidden", user };
  }

  return { status: "authorized", user };
}

/**
 * ロール要件チェック（例外ベース）
 * Server Actionsでの認可判定に使用
 *
 * @param requirement - ロール要件（atLeast: 必要最小権限）
 * @returns 認証済みユーザー情報
 * @throws {UnauthorizedError} 未認証の場合
 * @throws {ForbiddenError} 権限不足の場合
 *
 * @example
 * ```typescript
 * export async function updateResourceAction(input: unknown) {
 *   const user = await assertRole({ atLeast: "MANAGER" });
 *   // マネージャー以上の処理...
 * }
 * ```
 */
export async function assertRole(
  requirement: RoleRequirement
): Promise<AuthenticatedUser> {
  const result = await ensureRole(requirement);
  if (result.status === "authorized") {
    return result.user;
  }
  if (result.status === "unauthenticated") {
    throw new UnauthorizedError();
  }
  throw new ForbiddenError("Forbidden: insufficient role");
}

/**
 * 管理者権限チェック
 * Server Action 内で管理者のみに操作を許可する場合に使用
 *
 * @returns 認証済み管理者ユーザー情報
 * @throws {UnauthorizedError} 未認証の場合
 * @throws {ForbiddenError} 管理者権限がない場合
 *
 * @example
 * ```typescript
 * export async function deleteUserAction(id: string) {
 *   const admin = await requireAdmin();
 *   // 管理者専用処理...
 * }
 * ```
 */
export async function requireAdmin(): Promise<AuthenticatedUser> {
  return await assertRole({ atLeast: "ADMIN" });
}

/**
 * マネージャー権限チェック
 * Server Action 内でマネージャー以上（ADMIN または MANAGER）に操作を許可する場合に使用
 *
 * @returns 認証済みマネージャー以上のユーザー情報
 * @throws {UnauthorizedError} 未認証の場合
 * @throws {ForbiddenError} マネージャー権限がない場合
 *
 * @example
 * ```typescript
 * export async function createDepartmentAction(input: unknown) {
 *   const user = await requireManagerAuth();
 *   // マネージャー以上専用処理...
 * }
 * ```
 */
export async function requireManagerAuth(): Promise<AuthenticatedUser> {
  return await assertRole({ atLeast: "MANAGER" });
}

/**
 * 認証必須チェック
 * Server Action 内で認証済みユーザーのみに操作を許可する場合に使用
 *
 * @returns 認証済みユーザー情報
 * @throws {UnauthorizedError} 未認証の場合
 *
 * @example
 * ```typescript
 * export async function createResourceAction(input: unknown) {
 *   const user = await requireAuth();
 *   // 認証済みユーザー向け処理...
 * }
 * ```
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  return await assertRole({ atLeast: "MEMBER" });
}

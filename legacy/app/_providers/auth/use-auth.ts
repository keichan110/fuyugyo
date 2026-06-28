"use client";

import { useAuthContext } from "./auth-provider";
import type { User } from "./types";

/**
 * AuthContext を使用するカスタムフック
 * 認証状態とユーザー情報にアクセスするために使用
 *
 * @returns AuthContextValue
 * @throws Error AuthProvider外で使用された場合
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, status, logout } = useAuth();
 *
 *   if (status === 'loading') {
 *     return <div>Loading...</div>;
 *   }
 *
 *   if (status === 'unauthenticated') {
 *     return <div>Please log in</div>;
 *   }
 *
 *   return (
 *     <div>
 *       <p>Welcome, {user?.displayName}!</p>
 *       <button onClick={logout}>Logout</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useAuth() {
  return useAuthContext();
}

/**
 * 認証が必要なコンポーネントで使用するカスタムフック
 * 認証されていない場合は自動的にリダイレクトやエラー処理を行う
 *
 * @returns 認証済みユーザー情報（null以外が保証される）
 * @throws Error 認証されていない場合
 *
 * @example
 * ```tsx
 * function ProtectedComponent() {
 *   const user = useRequireAuth();
 *   // この時点でuserはnullではないことが保証される
 *
 *   return (
 *     <div>
 *       <h1>Admin Dashboard</h1>
 *       <p>Welcome, {user.displayName}!</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useRequireAuth(): User {
  const { user, status } = useAuthContext();

  if (status === "loading") {
    throw new Error("Authentication is still loading");
  }

  if (status === "unauthenticated" || !user) {
    throw new Error("Authentication required");
  }

  if (status === "error") {
    throw new Error("Authentication error occurred");
  }

  return user;
}

/**
 * 特定の権限が必要なコンポーネントで使用するカスタムフック
 *
 * @param requiredRole 必要な権限レベル
 * @returns 認証済みユーザー情報（権限確認済み）
 * @throws Error 権限が不足している場合
 *
 * @example
 * ```tsx
 * function AdminOnlyComponent() {
 *   const user = useRequireRole('ADMIN');
 *   // この時点でuserはADMIN権限を持つことが保証される
 *
 *   return <div>Admin only content</div>;
 * }
 * ```
 */
export function useRequireRole(
  requiredRole: "ADMIN" | "MANAGER" | "MEMBER"
): User {
  const user = useRequireAuth();

  const roleHierarchy = {
    ADMIN: 3,
    MANAGER: 2,
    MEMBER: 1,
  };

  const userRoleLevel = roleHierarchy[user.role];
  const requiredRoleLevel = roleHierarchy[requiredRole];

  if (userRoleLevel < requiredRoleLevel) {
    throw new Error(
      `Insufficient permissions. Required: ${requiredRole}, Current: ${user.role}`
    );
  }

  return user;
}

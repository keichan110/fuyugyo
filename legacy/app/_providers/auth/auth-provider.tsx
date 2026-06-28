"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { HTTP_STATUS_FORBIDDEN, HTTP_STATUS_UNAUTHORIZED } from "@/constants";
import type {
  ApiResponse,
  AuthContextValue,
  AuthProviderProps,
  AuthStatus,
  InitialUser,
  User,
} from "./types";

/**
 * 認証状態管理Context
 * アプリケーション全体で認証状態とユーザー情報を管理
 */

/**
 * AuthContext作成
 */
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * ユーザー情報取得
 */
async function fetchUserInfo(): Promise<User | null> {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "include", // Cookieを含める
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    if (
      response.status === HTTP_STATUS_UNAUTHORIZED ||
      response.status === HTTP_STATUS_FORBIDDEN
    ) {
      // 未認証または無効なユーザー
      return null;
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data: ApiResponse<User> = await response.json();

  if (!(data.success && data.user)) {
    return null;
  }

  // Date型に変換
  return {
    ...data.user,
    createdAt: new Date(data.user.createdAt),
    updatedAt: new Date(data.user.updatedAt),
  };
}

/**
 * ログアウト処理
 */
async function performLogout(): Promise<void> {
  try {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      // ログアウトは失敗してもクライアント側では成功として扱う
    }

    await response.json();
  } catch {
    // ネットワークエラー等でもクライアント側では成功として扱う
  }
}

/**
 * 表示名更新
 */
async function updateUserDisplayName(newDisplayName: string): Promise<User> {
  const response = await fetch("/api/auth/me", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ displayName: newDisplayName }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `HTTP ${response.status}: ${response.statusText}`
    );
  }

  const data: ApiResponse<User> = await response.json();

  if (!(data.success && data.user)) {
    throw new Error("Failed to update display name");
  }

  // Date型に変換
  return {
    ...data.user,
    createdAt: new Date(data.user.createdAt),
    updatedAt: new Date(data.user.updatedAt),
  };
}

/**
 * InitialUser を User 型に変換する
 * 不足しているフィールドには仮の値を設定する
 */
function convertInitialUser(initial: InitialUser | User | null): User | null {
  if (!initial) {
    return null;
  }

  // すでに User 型の場合（isActive フィールドの存在で判定）
  if ("isActive" in initial) {
    return initial as User;
  }

  // InitialUser から User へ変換（不足フィールドに仮の値を設定）
  const now = new Date();
  return {
    ...initial,
    pictureUrl: initial.pictureUrl ?? null,
    instructorId: initial.instructorId ?? null,
    isActive: true, // レイアウトで認証済みなので true
    createdAt: now, // 仮の値（クライアント側では使用しない想定）
    updatedAt: now, // 仮の値（クライアント側では使用しない想定）
  };
}

/**
 * AuthProvider コンポーネント
 * アプリケーション全体に認証状態を提供
 *
 * @param children - 子コンポーネント
 * @param initialUser - 初期ユーザー情報（サーバーサイドから渡される場合）
 * @param initialStatus - 初期認証状態（サーバーサイドから渡される場合）
 *
 * @example
 * ```tsx
 * // レイアウトでサーバー判定結果を渡す場合
 * export default async function MemberLayout({ children }: Props) {
 *   const result = await ensureRole({ atLeast: "MEMBER" });
 *   if (result.status === "unauthenticated") redirect(buildLoginRedirectUrl());
 *   if (result.status === "forbidden") redirect(ACCESS_DENIED_REDIRECT);
 *
 *   const { user } = result; // status === "authorized"
 *   return (
 *     <AuthProvider initialStatus="authenticated" initialUser={user}>
 *       {children}
 *     </AuthProvider>
 *   );
 * }
 * ```
 */
export function AuthProvider({
  children,
  initialUser,
  initialStatus,
}: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(
    convertInitialUser(initialUser ?? null)
  );
  // initialStatus が未指定の場合、initialUser から推論
  // initialUser が存在する場合は "authenticated"、そうでなければ "loading"
  const [status, setStatus] = useState<AuthStatus>(
    initialStatus ?? (initialUser ? "authenticated" : "loading")
  );
  const [error, setError] = useState<string | null>(null);

  /**
   * ユーザー情報取得・更新
   */
  const fetchAndSetUser = useCallback(async () => {
    try {
      setStatus("loading");
      setError(null);

      const userData = await fetchUserInfo();

      if (userData) {
        setUser(userData);
        setStatus("authenticated");
      } else {
        setUser(null);
        setStatus("unauthenticated");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Authentication check failed";
      setError(errorMessage);
      setStatus("error");
      setUser(null);
    }
  }, []);

  /**
   * ログアウト処理
   */
  const logout = async () => {
    try {
      // API呼び出しでサーバー側のログアウト処理
      await performLogout();
    } finally {
      // ローカル状態をクリア
      setUser(null);
      setStatus("unauthenticated");
      setError(null);

      // 注意：リダイレクト処理は呼び出し側（専用ログアウトページ）で実行
    }
  };

  /**
   * 表示名更新
   */
  const updateDisplayName = async (
    newDisplayName: string
  ): Promise<boolean> => {
    try {
      if (!user) {
        throw new Error("User not authenticated");
      }

      const updatedUser = await updateUserDisplayName(newDisplayName);
      setUser(updatedUser);
      return true;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to update display name";
      setError(errorMessage);
      return false;
    }
  };

  /**
   * 初回マウント時に認証状態をチェック
   * initialUser/initialStatus が提供されている場合は追加フェッチをスキップ
   */
  useEffect(() => {
    // 両方が明示的に提供されている場合はスキップ
    if (initialStatus !== undefined && initialUser !== undefined) {
      return;
    }

    // initialUser が提供されていない（undefined または null）場合のみフェッチ
    if (!initialUser) {
      fetchAndSetUser();
    }
  }, [fetchAndSetUser, initialUser, initialStatus]);

  /**
   * Context値
   */
  const contextValue: AuthContextValue = {
    user,
    status,
    error,
    refetch: fetchAndSetUser,
    logout,
    updateDisplayName,
    checkAuth: fetchAndSetUser, // checkAuthとrefetchは同じ処理
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

/**
 * AuthContext へのアクセス用フック（内部使用）
 */
export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }

  return context;
}

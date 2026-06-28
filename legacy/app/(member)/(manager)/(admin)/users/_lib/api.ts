/**
 * ユーザー管理API クライアント（READ専用）
 * Write操作はServer Actionsを使用してください
 */

import type { UserApiResponse, UserFilters, UserWithDetails } from "./types";

const API_BASE_URL = "/api/auth/users";

/**
 * ユーザー一覧取得（READ専用）
 */
export async function fetchUsers(
  filters?: Partial<UserFilters>
): Promise<UserWithDetails[]> {
  const searchParams = new URLSearchParams();

  if (filters?.role && filters.role !== "all") {
    searchParams.append("role", filters.role);
  }

  if (filters?.status && filters.status !== "all") {
    searchParams.append(
      "active",
      filters.status === "active" ? "true" : "false"
    );
  }

  const url = searchParams.toString()
    ? `${API_BASE_URL}?${searchParams.toString()}`
    : API_BASE_URL;

  const response = await fetch(url, {
    method: "GET",
    credentials: "include", // Cookieベースの認証
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`ユーザー一覧の取得に失敗しました: ${response.status}`);
  }

  const result: UserApiResponse<{
    users: UserWithDetails[];
    total: number;
    page: number;
    limit: number;
  }> = await response.json();

  if (!(result.success && result.data)) {
    throw new Error(result.error || "ユーザー一覧の取得に失敗しました");
  }

  return result.data.users;
}

/**
 * ユーザー詳細取得（READ専用）
 */
export async function fetchUser(id: string): Promise<UserWithDetails> {
  const response = await fetch(`${API_BASE_URL}/${id}`, {
    method: "GET",
    credentials: "include", // Cookieベースの認証
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`ユーザー詳細の取得に失敗しました: ${response.status}`);
  }

  const result: UserApiResponse<UserWithDetails> = await response.json();

  if (!(result.success && result.data)) {
    throw new Error(result.error || "ユーザー詳細の取得に失敗しました");
  }

  return result.data;
}

/**
 * ロール表示名取得（UIヘルパー）
 */
export function getRoleDisplayName(
  role: "ADMIN" | "MANAGER" | "MEMBER"
): string {
  const roleNames = {
    ADMIN: "管理者",
    MANAGER: "マネージャー",
    MEMBER: "メンバー",
  };
  return roleNames[role];
}

/**
 * ロール色取得（UIヘルパー）
 */
export function getRoleColor(role: "ADMIN" | "MANAGER" | "MEMBER"): string {
  const roleColors = {
    ADMIN: "text-red-600 dark:text-red-400",
    MANAGER: "text-blue-600 dark:text-blue-400",
    MEMBER: "text-green-600 dark:text-green-400",
  };
  return roleColors[role];
}

/**
 * 認証関連の型定義
 */

/**
 * ユーザー情報の型定義
 */
import type { ReactNode } from "react";

export type User = {
  /** ユーザーID */
  id: string;
  /** LINEユーザーID */
  lineUserId: string;
  /** 表示名 */
  displayName: string;
  /** LINEプロフィール画像URL */
  pictureUrl: string | null;
  /** ユーザー権限 */
  role: "ADMIN" | "MANAGER" | "MEMBER";
  /** 紐付けられたインストラクターID */
  instructorId: string | null;
  /** アクティブフラグ */
  isActive: boolean;
  /** 作成日時 */
  createdAt: Date;
  /** 更新日時 */
  updatedAt: Date;
};

/**
 * 認証状態の型定義
 */
export type AuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

/**
 * 認証Contextの値の型定義
 */
export type AuthContextValue = {
  /** 現在のユーザー情報 */
  user: User | null;
  /** 認証状態 */
  status: AuthStatus;
  /** エラーメッセージ */
  error: string | null;
  /** ユーザー情報の再取得 */
  refetch: () => Promise<void>;
  /** ログアウト */
  logout: () => Promise<void>;
  /** 表示名の更新 */
  updateDisplayName: (newDisplayName: string) => Promise<boolean>;
  /** 認証チェック(手動実行用) */
  checkAuth: () => Promise<void>;
};

/**
 * 簡易ユーザー情報型（レイアウトからの初期化用）
 * Server Components の ensureRole から得られる最小限のユーザー情報
 */
export type InitialUser = {
  id: string;
  lineUserId: string;
  displayName: string;
  pictureUrl?: string | null;
  role: "ADMIN" | "MANAGER" | "MEMBER";
  instructorId?: string | null;
};

/**
 * AuthProviderのProps
 */
export type AuthProviderProps = {
  children: ReactNode;
  /**
   * 初期ユーザー情報（サーバーサイドで取得済みの場合）
   * レイアウトで ensureRole を使って取得したユーザー情報を渡すことで、
   * クライアント側での追加フェッチを回避できる
   *
   * InitialUser（最小限の情報）または User（完全な情報）を受け入れる
   */
  initialUser?: InitialUser | User | null;
  /**
   * 初期認証状態（サーバーサイドで判定済みの場合）
   * レイアウトでの認証結果を渡すことで、クライアント側の初期状態を制御できる
   */
  initialStatus?: "authenticated" | "unauthenticated" | "loading";
};

/**
 * API Response型定義
 */
export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  user?: T;
  error?: string;
};

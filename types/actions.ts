/**
 * Server Actions の統一レスポンス型
 * すべての Server Actions は成功時に data を返し、失敗時に error を返す
 */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * API Response 型（既存との互換性維持）
 * 従来の API Routes との互換性を保つための型定義
 */
export type ApiResponse<T> = {
  success: boolean;
  data: T | null;
  message: string | null;
  error: string | null;
};

/**
 * 認証済みユーザー型
 * JWT トークンから抽出されたユーザー情報
 */
export type AuthenticatedUser = {
  /** ユーザーID (cuid形式) */
  id: string;
  /** LINEユーザーID */
  lineUserId: string;
  /** 表示名 */
  displayName: string;
  /** プロフィール画像URL */
  pictureUrl: string | null;
  /** ユーザー権限 */
  role: "ADMIN" | "MANAGER" | "MEMBER";
  /** 紐付けられたインストラクターID (cuid形式) */
  instructorId: string | null;
  /** アクティブフラグ（権限チェックで使用） */
  isActive: boolean;
  /** 作成日時 */
  createdAt: Date;
  /** 更新日時 */
  updatedAt: Date;
};

/**
 * インストラクター基本情報型
 * ダイアログでの選択肢表示用
 */
export type InstructorBasicInfo = {
  id: string;
  lastName: string;
  firstName: string;
  lastNameKana: string | null;
  firstNameKana: string | null;
  status: string;
};

/**
 * ユーザーのインストラクター情報（詳細版）
 * プロフィール表示用
 */
export type UserInstructorProfile = {
  id: string;
  lastName: string;
  firstName: string;
  lastNameKana: string | null;
  firstNameKana: string | null;
  status: string;
  certifications: {
    id: string;
    name: string;
    shortName: string;
    organization: string;
  }[];
};

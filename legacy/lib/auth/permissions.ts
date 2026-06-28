/**
 * 権限管理ユーティリティ
 *
 * 3段階権限制御システムの権限チェック機能を提供
 * - ADMIN: 全機能アクセス可能、ユーザー管理・招待URL管理
 * - MANAGER: 既存のシフト管理機能アクセス可能
 * - MEMBER: シフト表閲覧のみ
 */

import type { AuthenticatedUser } from "./types";

// ユーザーロール定義（Prisma enum と同期）
export type UserRole = "ADMIN" | "MANAGER" | "MEMBER";

// リソース種別定義
export type Resource =
  | "users" // ユーザー管理
  | "invitations" // 招待URL管理
  | "departments" // 部門管理
  | "instructors" // インストラクター管理
  | "certifications" // 資格管理
  | "shifts" // シフト管理
  | "shift-types" // シフト種別管理
  | "shift-assignments" // シフト割り当て管理
  | "public-shifts"; // 公開シフト表

// アクション種別定義
export type Action = "create" | "read" | "update" | "delete" | "manage";

// 権限レベル定義
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  ADMIN: 3,
  MANAGER: 2,
  MEMBER: 1,
} as const;

// ロール名表示用マッピング
export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "管理者",
  MANAGER: "マネージャー",
  MEMBER: "メンバー",
} as const;

// 権限マトリックス定義
type PermissionMatrix = Record<UserRole, Record<Resource, Action[]>>;

export const PERMISSIONS: PermissionMatrix = {
  ADMIN: {
    // 管理者: 全リソースに対する全権限
    users: ["create", "read", "update", "delete", "manage"],
    invitations: ["create", "read", "update", "delete", "manage"],
    departments: ["create", "read", "update", "delete", "manage"],
    instructors: ["create", "read", "update", "delete", "manage"],
    certifications: ["create", "read", "update", "delete", "manage"],
    shifts: ["create", "read", "update", "delete", "manage"],
    "shift-types": ["create", "read", "update", "delete", "manage"],
    "shift-assignments": ["create", "read", "update", "delete", "manage"],
    "public-shifts": ["read"],
  },

  MANAGER: {
    // マネージャー: シフト関連機能への CRUD + manage 権限
    users: ["read"], // 自分の情報のみ
    invitations: [], // 招待URL管理不可
    departments: ["create", "read", "update", "delete", "manage"],
    instructors: ["create", "read", "update", "delete", "manage"],
    certifications: ["create", "read", "update", "delete", "manage"],
    shifts: ["create", "read", "update", "delete", "manage"],
    "shift-types": ["create", "read", "update", "delete", "manage"],
    "shift-assignments": ["create", "read", "update", "delete", "manage"],
    "public-shifts": ["read"],
  },

  MEMBER: {
    // メンバー: シフト表閲覧と基本情報参照
    users: ["read"], // 自分の情報のみ
    invitations: [], // 招待URL管理不可
    departments: ["read"], // 部門情報参照
    instructors: ["read"], // インストラクター情報参照
    certifications: ["read"], // 資格情報参照
    shifts: ["read"], // シフト表閲覧
    "shift-types": ["read"], // シフト種別参照
    "shift-assignments": ["read"], // シフト割り当て情報参照
    "public-shifts": ["read"], // 公開シフト表閲覧
  },
} as const;

/**
 * ユーザーが指定したリソースに対する指定したアクションの権限を持つかチェック
 */
export function hasPermission(
  user: AuthenticatedUser | null | undefined,
  resource: Resource,
  action: Action
): boolean {
  // 未認証ユーザーは権限なし
  if (!user) {
    return false;
  }

  // 非アクティブユーザーは権限なし
  if (!user.isActive) {
    return false;
  }

  // 権限マトリックスから該当するアクションをチェック
  const userPermissions = PERMISSIONS[user.role];
  const resourcePermissions = userPermissions[resource];

  return resourcePermissions.includes(action);
}

/**
 * ユーザーが管理権限（manage）を持つかチェック
 * 主にUI表示の条件分岐に使用
 */
export function hasManagePermission(
  user: AuthenticatedUser | null | undefined,
  resource: Resource
): boolean {
  return hasPermission(user, resource, "manage");
}

/**
 * ユーザーが指定したロールレベル以上かチェック
 */
export function hasMinimumRole(
  user: AuthenticatedUser | null | undefined,
  minimumRole: UserRole
): boolean {
  if (!user?.isActive) {
    return false;
  }

  return ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[minimumRole];
}

/**
 * ユーザーが管理者権限を持つかチェック
 */
export function isAdmin(user: AuthenticatedUser | null | undefined): boolean {
  return user?.isActive === true && user.role === "ADMIN";
}

/**
 * ユーザーがマネージャー権限以上を持つかチェック
 */
export function isManagerOrAdmin(
  user: AuthenticatedUser | null | undefined
): boolean {
  return hasMinimumRole(user, "MANAGER");
}

/**
 * ユーザーがメンバー権限以上を持つかチェック（認証済みユーザー）
 */
export function isAuthenticated(
  user: AuthenticatedUser | null | undefined
): boolean {
  return hasMinimumRole(user, "MEMBER");
}

/**
 * リソースに対するフルアクセス権限をチェック
 * 作成・読み取り・更新・削除の全ての権限を持つかチェック
 */
export function hasFullAccess(
  user: AuthenticatedUser | null | undefined,
  resource: Resource
): boolean {
  if (!user?.isActive) {
    return false;
  }

  const requiredActions: Action[] = ["create", "read", "update", "delete"];
  return requiredActions.every((action) =>
    hasPermission(user, resource, action)
  );
}

/**
 * ユーザーのロール情報を取得
 */
export function getUserRoleInfo(user: AuthenticatedUser | null | undefined) {
  if (!user) {
    return {
      role: null,
      label: "未認証",
      level: 0,
      isActive: false,
    };
  }

  return {
    role: user.role,
    label: ROLE_LABELS[user.role],
    level: ROLE_HIERARCHY[user.role],
    isActive: user.isActive,
  };
}

/**
 * 権限エラー用のエラーメッセージ生成
 */
export function getPermissionErrorMessage(
  resource: Resource,
  action: Action,
  userRole?: UserRole
): string {
  const resourceLabels: Record<Resource, string> = {
    users: "ユーザー管理",
    invitations: "招待URL管理",
    departments: "部門管理",
    instructors: "インストラクター管理",
    certifications: "資格管理",
    shifts: "シフト管理",
    "shift-types": "シフト種別管理",
    "shift-assignments": "シフト割り当て管理",
    "public-shifts": "シフト表閲覧",
  };

  const actionLabels: Record<Action, string> = {
    create: "作成",
    read: "閲覧",
    update: "更新",
    delete: "削除",
    manage: "管理",
  };

  const resourceLabel = resourceLabels[resource] || resource;
  const actionLabel = actionLabels[action] || action;
  const roleLabel = userRole ? ROLE_LABELS[userRole] : "現在の権限";

  return `${resourceLabel}の${actionLabel}権限がありません。${roleLabel}では実行できません。`;
}

/**
 * ユーザーリソースアクセス用の特別なチェック
 * 自分の情報は閲覧可能、他人の情報は管理者のみ
 */
export function canAccessUser(
  currentUser: AuthenticatedUser | null | undefined,
  targetUserId: string,
  action: Action
): boolean {
  if (!currentUser?.isActive) {
    return false;
  }

  // 管理者は全ユーザーにアクセス可能
  if (currentUser.role === "ADMIN") {
    return hasPermission(currentUser, "users", action);
  }

  // 自分の情報の場合
  if (currentUser.id === targetUserId) {
    // 自分の情報は read のみ可能（更新・削除は管理者のみ）
    return action === "read";
  }

  // 他人の情報へのアクセスは管理者のみ
  return false;
}

/**
 * API エンドポイント用の権限チェック関数
 * HTTP メソッドから適切なアクションを推定
 */
export function checkApiPermission(
  user: AuthenticatedUser | null | undefined,
  resource: Resource,
  httpMethod: string
): boolean {
  let action: Action;

  switch (httpMethod.toUpperCase()) {
    case "GET":
      action = "read";
      break;
    case "POST":
      action = "create";
      break;
    case "PUT":
    case "PATCH":
      action = "update";
      break;
    case "DELETE":
      action = "delete";
      break;
    default:
      return false;
  }

  return hasPermission(user, resource, action);
}

/**
 * デバッグ用: ユーザーの全権限を取得
 */
export function getUserPermissions(user: AuthenticatedUser | null | undefined) {
  if (!user?.isActive) {
    return {
      role: null,
      permissions: {},
      hasAnyPermission: false,
    };
  }

  const permissions = PERMISSIONS[user.role];
  const hasAnyPermission = Object.values(permissions).some(
    (actions) => actions.length > 0
  );

  return {
    role: user.role,
    permissions,
    hasAnyPermission,
    roleInfo: getUserRoleInfo(user),
  };
}

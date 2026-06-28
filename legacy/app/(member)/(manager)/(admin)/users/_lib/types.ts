/**
 * ユーザー管理画面の型定義
 */

/**
 * シリアライズ済みのユーザー詳細型
 * Server ComponentからClient Componentに渡すため、Date型はstring型に変換
 */
export type UserWithDetails = {
  id: string;
  lineUserId: string;
  displayName: string;
  role: "ADMIN" | "MANAGER" | "MEMBER";
  isActive: boolean;
  createdAt: string; // Date → ISO 8601 string
  updatedAt: string; // Date → ISO 8601 string
};

export type UpdateUserRequest = {
  displayName?: string;
  role?: "ADMIN" | "MANAGER" | "MEMBER";
  isActive?: boolean;
};

export type UserFormData = {
  displayName: string;
  role: "ADMIN" | "MANAGER" | "MEMBER";
  isActive: boolean;
};

export type UserStats = {
  total: number;
  active: number;
  admins: number;
  managers: number;
  members: number;
};

export type UserApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type UserRole = "ADMIN" | "MANAGER" | "MEMBER";

export type UserFilters = {
  role: "all" | UserRole;
  status: "all" | "active" | "inactive";
};

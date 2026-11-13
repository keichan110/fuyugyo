import { VALID_ROLES, type JwtPayload, type UserRole } from './jwt';

/** DB のロールを有効な UserRole に絞り込む。不正値は MEMBER として扱う */
export function toUserRole(role: string): UserRole {
  return VALID_ROLES.find((validRole) => validRole === role) ?? 'MEMBER';
}

/** DB から取得した最新のユーザー情報を JWT ペイロードへ変換する */
export function toJwtPayload(user: {
  id: string;
  lineUserId: string;
  displayName: string;
  role: string;
  isActive: boolean;
}): JwtPayload {
  return {
    userId: user.id,
    lineUserId: user.lineUserId,
    displayName: user.displayName,
    role: toUserRole(user.role),
    isActive: user.isActive,
  };
}

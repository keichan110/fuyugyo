import type { UserRole } from './jwt';

/**
 * ロールの序列（ADR 0003）。ADMIN > MANAGER > MEMBER。
 * 数値が大きいほど強い権限を表す。
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  ADMIN: 3,
  MANAGER: 2,
  MEMBER: 1,
};

/**
 * `role` が `required` 以上の権限を持つか判定する。
 *
 * @param role - 判定対象のロール
 * @param required - 要求する最低ロール
 */
export function hasMinimumRole(role: UserRole, required: UserRole): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[required];
}

/** 時間文字列（例: "12h", "7d", "30m", "45s"）を秒に変換する */
const DURATION_UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
};

/**
 * `"12h"` のような時間文字列を秒数へ変換する。Cookie の maxAge と JWT 有効期限を揃えるために使う。
 *
 * @param duration - 数値 + 単位（s/m/h/d）の文字列
 * @returns 秒数。形式不正時は 12 時間にフォールバックする
 */
export function durationToSeconds(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  const fallback = 12 * 60 * 60;
  if (!match) {
    return fallback;
  }
  const value = Number(match[1]);
  const unit = match[2];
  const factor = unit ? DURATION_UNITS[unit] : undefined;
  return factor ? value * factor : fallback;
}

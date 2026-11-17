import type { UserRole } from './schema';

/**
 * 操作者のロールで、対象ユーザーのステータス（有効/無効）を変更できるか判定する。
 * ADMIN は全員、MANAGER は MEMBER のみ変更できる。
 * MANAGER が MANAGER/ADMIN を変更できると権限の逆転や ADMIN の排除が起こるため MEMBER に限る。
 * 自分自身の変更可否はこの判定に含めない（呼び出し側で別途扱う）。
 * サーバー（`setUserActive`）と UI（`UserDrawer`）の判定を一致させるため、両方から使う。
 *
 * @param actorRole - 操作者のロール
 * @param targetRole - 対象ユーザーのロール
 */
export function canChangeUserStatus(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === 'ADMIN') return true;
  return actorRole === 'MANAGER' && targetRole === 'MEMBER';
}

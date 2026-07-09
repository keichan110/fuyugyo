import dayjs from 'dayjs';

import 'dayjs/locale/ja';

import relativeTime from 'dayjs/plugin/relativeTime';

import type { Invitation } from './schema';

// このモジュールが src 内で dayjs を使う唯一の初出箇所のため、
// プラグイン適用とロケール設定をここで一度だけ行う。
dayjs.extend(relativeTime);
dayjs.locale('ja');

/** 招待リンクの有効期限プリセット */
export const EXPIRY_PRESETS = [
  { label: '24時間', hours: 24 },
  { label: '3日', hours: 72 },
  { label: '1週間', hours: 168 },
  { label: '1ヶ月', hours: 720 },
] as const;

/** 有効期限プリセットの初期選択値（env.INVITE_DEFAULT_EXPIRES="168h" と一致） */
export const DEFAULT_EXPIRY_HOURS = 168;

/** 招待トークンの表示上のステータス */
export type InvitationStatus = 'active' | 'expired' | 'deactivated' | 'exhausted';

/**
 * 招待トークンの表示上のステータスを判定する。
 *
 * 置き換えによる自動失効と手動停止は DB 上区別できないため、判定は
 * 「期限切れ → 停止済み → 上限到達 → 有効」の優先順位で行う。
 * 常に正確な事実である期限切れを優先し、期限内に停止されたものだけを
 * 「停止済み」として扱う。
 */
export function invitationStatusOf(invitation: Invitation, now: Date): InvitationStatus {
  if (invitation.expiresAt <= now) {
    return 'expired';
  }
  if (!invitation.isActive) {
    return 'deactivated';
  }
  if (invitation.maxUses !== null && invitation.usedCount >= invitation.maxUses) {
    return 'exhausted';
  }
  return 'active';
}

/** 招待トークン一覧から現在有効な1件を探す（有効な招待は常に1件のみ）。 */
export function findActiveInvitation(invitations: Invitation[], now: Date): Invitation | undefined {
  return invitations.find((invitation) => invitationStatusOf(invitation, now) === 'active');
}

/** 招待トークンから招待リンク（LINEログイン誘導URL）を組み立てる。 */
export function buildInviteUrl(origin: string, token: string): string {
  return `${origin}/api/auth/line/login?invite=${token}&redirect=/`;
}

/** 日時を 'YYYY/MM/DD HH:mm' 形式でフォーマットする。 */
export function formatDateTime(date: Date): string {
  return dayjs(date).format('YYYY/MM/DD HH:mm');
}

/** 有効期限までの残り時間を「3日」等の相対表示（接尾辞なし）で返す。 */
export function remainingLabel(expiresAt: Date, now: Date): string {
  return dayjs(expiresAt).from(now, true);
}

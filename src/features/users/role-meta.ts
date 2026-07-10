import type { AppBadgeKind } from '@/components/AppBadge';

import type { UserRole } from './schema';

/** ユーザーロールごとの表示ラベルとバッジ種別 */
export const USER_ROLE_META: Record<UserRole, { label: string; badgeKind: AppBadgeKind }> = {
  ADMIN: { label: '管理者', badgeKind: 'roleAdmin' },
  MANAGER: { label: 'マネージャー', badgeKind: 'roleManager' },
  MEMBER: { label: 'メンバー', badgeKind: 'roleMember' },
};

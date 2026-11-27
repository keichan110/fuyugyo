import { ActionIcon, Indicator } from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';

import { useNotificationSummary } from '../queries';

/**
 * ヘッダーに置くお知らせ履歴へのリンク。未読があるときだけ点を付け、件数を名前で伝える。
 * 取得に失敗しても、履歴へは移動できる。
 */
export function NotificationHeaderLink() {
  const { data, isError } = useNotificationSummary();
  // 取得に失敗している間は、古い件数を根拠に未読を示さない
  const unreadCount = isError ? 0 : (data?.unreadCount ?? 0);
  const label = unreadCount > 0 ? `お知らせ（未読${unreadCount}件）` : 'お知らせ';

  return (
    <ActionIcon
      component={Link}
      to="/notifications"
      variant="transparent"
      c="inherit"
      size={40}
      aria-label={label}
      title={label}
    >
      <Indicator color="accent.4" size={10} offset={3} disabled={unreadCount === 0}>
        <IconBell size={24} stroke={1.75} display="block" aria-hidden />
      </Indicator>
    </ActionIcon>
  );
}

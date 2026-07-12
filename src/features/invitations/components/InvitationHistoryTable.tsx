import { Table, Text } from '@mantine/core';

import { AppBadge, type AppBadgeKind } from '@/components/AppBadge';

import { formatDateTime, invitationStatusOf, type InvitationStatus } from '../lib';
import type { Invitation } from '../schema';

/** ステータスごとのバッジ種別 */
const STATUS_BADGE_KINDS: Record<InvitationStatus, AppBadgeKind> = {
  active: 'active',
  expired: 'danger',
  deactivated: 'inactive',
  exhausted: 'warning', // 旧データ互換（UIからmaxUsesは送らないが過去データには残り得る）
};

/** ステータスごとの表示ラベル */
const STATUS_LABELS: Record<InvitationStatus, string> = {
  active: '有効',
  expired: '期限切れ',
  deactivated: '停止済み',
  exhausted: '上限到達',
};

type InvitationHistoryTableProps = {
  invitations: Invitation[];
};

/**
 * 招待トークンの発行履歴を読み取り専用で表示するテーブル。
 * 操作列を持たず、行ホバーも強調しない（編集・停止不可を構造で表現する）。
 * トークン・URLは表示しない（停止済みリンクの再共有と漏洩面積を減らす）。
 */
export function InvitationHistoryTable({ invitations }: InvitationHistoryTableProps) {
  if (invitations.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        発行履歴はまだありません
      </Text>
    );
  }

  const now = new Date();

  return (
    <Table.ScrollContainer minWidth={560}>
      <Table withTableBorder verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>状態</Table.Th>
            <Table.Th>メモ</Table.Th>
            <Table.Th>有効期限</Table.Th>
            <Table.Th>使用回数</Table.Th>
            <Table.Th>作成日時</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {invitations.map((invitation) => {
            const status = invitationStatusOf(invitation, now);
            return (
              <Table.Tr key={invitation.token}>
                <Table.Td>
                  <AppBadge kind={STATUS_BADGE_KINDS[status]} size="sm">
                    {STATUS_LABELS[status]}
                  </AppBadge>
                </Table.Td>
                <Table.Td>
                  {invitation.description ? (
                    <Text size="sm" lineClamp={1}>
                      {invitation.description}
                    </Text>
                  ) : (
                    <Text c="dimmed" size="sm">
                      —
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{formatDateTime(invitation.expiresAt)}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {invitation.usedCount}
                    {invitation.maxUses !== null ? ` / ${invitation.maxUses}` : ''}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text c="dimmed" size="sm">
                    {formatDateTime(invitation.createdAt)}
                  </Text>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

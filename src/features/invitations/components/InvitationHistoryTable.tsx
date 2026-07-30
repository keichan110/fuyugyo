import { Group, Paper, Stack, Table, Text } from '@mantine/core';

import { AppBadge, type AppBadgeKind } from '@/components/AppBadge';
import mobileClasses from '@/components/MobileListItem.module.css';

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
    <>
      <Table.ScrollContainer minWidth={560} visibleFrom="sm">
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
            {invitations.map((invitation) => (
              <InvitationTableRow key={invitation.token} invitation={invitation} now={now} />
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Paper hiddenFrom="sm" withBorder p={0}>
        <Stack gap={0}>
          {invitations.map((invitation) => (
            <InvitationMobileRow key={invitation.token} invitation={invitation} now={now} />
          ))}
        </Stack>
      </Paper>
    </>
  );
}

type InvitationRowProps = { invitation: Invitation; now: Date };

/** デスクトップの招待履歴テーブル行。 */
function InvitationTableRow({ invitation, now }: InvitationRowProps) {
  const status = invitationStatusOf(invitation, now);
  return (
    <Table.Tr>
      <Table.Td>
        <AppBadge kind={STATUS_BADGE_KINDS[status]} size="sm">
          {STATUS_LABELS[status]}
        </AppBadge>
      </Table.Td>
      <Table.Td>
        <Text size="sm" lineClamp={1}>
          {invitation.description || '—'}
        </Text>
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
}

/** モバイル幅で招待履歴を名簿形式に表示する行。 */
function InvitationMobileRow({ invitation, now }: InvitationRowProps) {
  const status = invitationStatusOf(invitation, now);
  const className =
    status === 'active' ? mobileClasses.row : `${mobileClasses.row} ${mobileClasses.inactive}`;
  return (
    <div className={className}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4}>
          <Text fw={500} size="sm">
            {invitation.description || 'メモなし'}
          </Text>
          <Text c="dimmed" size="xs">
            有効期限: {formatDateTime(invitation.expiresAt)}
          </Text>
          <Text c="dimmed" size="xs">
            使用回数: {invitation.usedCount}
            {invitation.maxUses !== null ? ` / ${invitation.maxUses}` : ''}
          </Text>
        </Stack>
      </Group>
    </div>
  );
}

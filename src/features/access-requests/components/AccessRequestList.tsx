import { useState } from 'react';

import { Avatar, Checkbox, Group, Paper, Stack, Text } from '@mantine/core';
import { IconUserCheck } from '@tabler/icons-react';
import dayjs from 'dayjs';

import { ErrorAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { ListEmptyState } from '@/components/ListEmptyState';
import mobileClasses from '@/components/MobileListItem.module.css';
import { TableRowsSkeleton } from '@/components/TableRowsSkeleton';

import { useAccessRequests } from '../queries';
import { formatRequestLocation } from '../request-location';
import type { PendingAccessRequest } from '../schema';
import { ApproveAccessRequestModal } from './ApproveAccessRequestModal';
import { RejectAccessRequestsModal } from './RejectAccessRequestsModal';

/**
 * 承認待ちの利用申請一覧（ADMIN のみ）。
 * 申請ごとの承認・却下と、チェックした申請の一括却下を提供する。
 * 位置は接続元から推定した目安で、取得できない場合は「不明」と表示する。
 */
export function AccessRequestList() {
  const { data, isLoading, isError, refetch, isFetching } = useAccessRequests(true);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [approving, setApproving] = useState<PendingAccessRequest | null>(null);
  const [rejecting, setRejecting] = useState<PendingAccessRequest[] | null>(null);

  const requests = data ?? [];
  // 承認・却下で一覧から消えた申請の選択は無効にする
  const selected = requests.filter((request) => selectedIds.has(request.id));
  const allSelected = requests.length > 0 && selected.length === requests.length;

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  };

  return (
    <Stack gap="md">
      {isError && (
        <ErrorAlert
          title="承認待ちの申請を取得できませんでした"
          // 通信失敗を 0 件と取り違えないよう、再試行できるようにする
        >
          <Group justify="space-between">
            <Text size="sm">通信状況を確認して、もう一度お試しください。</Text>
            <AppButton
              intent="secondary"
              size="xs"
              loading={isFetching}
              onClick={() => void refetch()}
            >
              再読み込み
            </AppButton>
          </Group>
        </ErrorAlert>
      )}

      {isLoading && <TableRowsSkeleton />}

      {!isLoading && !isError && requests.length === 0 && (
        <ListEmptyState
          icon={<IconUserCheck size={32} stroke={1.5} />}
          title="承認待ちの申請はありません"
          description="申請は7日間で自動的に削除されます。"
        />
      )}

      {requests.length > 0 && (
        <>
          <Group justify="space-between">
            <Checkbox
              label="すべて選択"
              checked={allSelected}
              indeterminate={selected.length > 0 && !allSelected}
              onChange={(e) =>
                setSelectedIds(
                  e.currentTarget.checked ? new Set(requests.map((r) => r.id)) : new Set(),
                )
              }
            />
            <AppButton
              intent="danger"
              size="xs"
              disabled={selected.length === 0}
              onClick={() => setRejecting(selected)}
            >
              選択した申請を却下（{selected.length}件）
            </AppButton>
          </Group>
          <Paper withBorder p={0}>
            <Stack gap={0}>
              {requests.map((request) => (
                <div key={request.id} className={mobileClasses.row}>
                  <Group justify="space-between" wrap="wrap" gap="sm">
                    <Group gap="sm" wrap="nowrap">
                      <Checkbox
                        aria-label={`${request.displayName}を選択`}
                        checked={selectedIds.has(request.id)}
                        onChange={(e) => toggle(request.id, e.currentTarget.checked)}
                      />
                      <Avatar
                        src={request.pictureUrl}
                        name={request.displayName}
                        color="initials"
                        radius="xl"
                        size="md"
                      />
                      <Stack gap={2}>
                        <Text fw={500} size="sm">
                          {request.displayName}
                        </Text>
                        <Text size="xs" c="dimmed">
                          申請日時: {dayjs(request.requestedAt).format('YYYY/M/D HH:mm')}
                        </Text>
                        <Text size="xs" c="dimmed">
                          位置（目安）: {formatRequestLocation(request)}
                        </Text>
                      </Stack>
                    </Group>
                    <Group gap="xs">
                      <AppButton
                        intent="primary"
                        size="xs"
                        aria-label={`${request.displayName}を承認`}
                        onClick={() => setApproving(request)}
                      >
                        承認
                      </AppButton>
                      <AppButton
                        intent="danger"
                        size="xs"
                        aria-label={`${request.displayName}を却下`}
                        onClick={() => setRejecting([request])}
                      >
                        却下
                      </AppButton>
                    </Group>
                  </Group>
                </div>
              ))}
            </Stack>
          </Paper>
        </>
      )}

      <ApproveAccessRequestModal request={approving} onClose={() => setApproving(null)} />
      <RejectAccessRequestsModal
        requests={rejecting}
        onClose={() => setRejecting(null)}
        onDone={() => setSelectedIds(new Set())}
      />
    </Stack>
  );
}

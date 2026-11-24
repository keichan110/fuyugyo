import { useState } from 'react';

import { Group, List, Modal, Stack, Text } from '@mantine/core';

import { ErrorAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';

import { useRejectAccessRequest, useRejectAccessRequests } from '../queries';
import type { PendingAccessRequest } from '../schema';

type Props = {
  /** 却下対象の申請（1 件なら単体却下、複数なら一括却下）。null なら閉じる */
  requests: PendingAccessRequest[] | null;
  onClose: () => void;
  /** 却下に成功した後に呼ぶ（選択状態のリセットなど） */
  onDone: () => void;
};

/**
 * 利用申請の却下確認ダイアログ（単体・一括共通）。
 * 却下した LINE アカウントは、次回ログイン時に改めて申請できる。
 */
export function RejectAccessRequestsModal({ requests, onClose, onDone }: Props) {
  // 閉じるアニメーション中に表示内容が消えないよう、直近の対象を保持する
  const [last, setLast] = useState<PendingAccessRequest[] | null>(requests);
  if (requests !== null && requests !== last) setLast(requests);
  const shown = requests ?? last;

  return (
    <Modal opened={requests !== null} onClose={onClose} title="利用申請を却下" centered>
      {shown && (
        <RejectPanel
          key={shown.map((r) => r.id).join(',')}
          requests={shown}
          onClose={onClose}
          onDone={onDone}
        />
      )}
    </Modal>
  );
}

function RejectPanel({
  requests,
  onClose,
  onDone,
}: {
  requests: PendingAccessRequest[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [first] = requests;
  const rejectOne = useRejectAccessRequest(first?.id ?? '');
  const rejectMany = useRejectAccessRequests();
  // 1 件は単体却下 API、複数は一括却下 API を使う
  const reject = requests.length === 1 ? rejectOne : rejectMany;

  const submit = () => {
    const options = {
      onSuccess: () => {
        onDone();
        onClose();
      },
    };
    if (requests.length === 1) {
      rejectOne.mutate(undefined, options);
    } else {
      rejectMany.mutate(
        requests.map((r) => r.id),
        options,
      );
    }
  };

  return (
    <Stack gap="md">
      <Text size="sm">
        {requests.length}
        件の申請を却下します。却下した申請は元に戻せませんが、申請者はもう一度申請できます。
      </Text>
      <List size="sm" spacing={2}>
        {requests.map((request) => (
          <List.Item key={request.id}>{request.displayName}</List.Item>
        ))}
      </List>
      {reject.isError && <ErrorAlert>{reject.error.message}</ErrorAlert>}
      <Group justify="flex-end">
        <AppButton intent="secondary" onClick={onClose} disabled={reject.isPending}>
          キャンセル
        </AppButton>
        <AppButton intent="danger" emphasis="high" loading={reject.isPending} onClick={submit}>
          却下する
        </AppButton>
      </Group>
    </Stack>
  );
}

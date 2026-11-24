import { useState } from 'react';

import { Avatar, Group, Modal, Select, Stack, Text } from '@mantine/core';

import { ErrorAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { useInstructors } from '@/features/instructors/queries';
import { useUsers } from '@/features/users/queries';

import { useApproveAccessRequest } from '../queries';
import type { PendingAccessRequest } from '../schema';

type Props = {
  /** 承認対象の申請。null なら閉じる */
  request: PendingAccessRequest | null;
  onClose: () => void;
};

/**
 * 利用申請の承認ダイアログ。
 * 任意で ACTIVE のインストラクターを選んで同時に紐付けられる（既に別ユーザーへ紐付いた候補は選べない）。
 */
export function ApproveAccessRequestModal({ request, onClose }: Props) {
  // 閉じるアニメーション中に表示内容が消えないよう、直近の申請を保持する
  const [last, setLast] = useState<PendingAccessRequest | null>(request);
  if (request !== null && request !== last) setLast(request);
  const shown = request ?? last;

  return (
    <Modal opened={request !== null} onClose={onClose} title="利用申請を承認" centered>
      {shown && <ApprovePanel key={shown.id} request={shown} onClose={onClose} />}
    </Modal>
  );
}

function ApprovePanel({
  request,
  onClose,
}: {
  request: PendingAccessRequest;
  onClose: () => void;
}) {
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const approve = useApproveAccessRequest(request.id);
  const { data: instructors } = useInstructors('ACTIVE');
  const { data: users } = useUsers();

  // 既に別のユーザーに紐付いているインストラクターは選択不可にする
  const linkedIds = new Set(
    (users ?? []).flatMap((user) => (user.instructorId === null ? [] : [user.instructorId])),
  );

  const submit = () => {
    approve.mutate(instructorId === null ? {} : { instructorId }, { onSuccess: onClose });
  };

  return (
    <Stack gap="md">
      <Group gap="sm" wrap="nowrap">
        <Avatar src={request.pictureUrl} name={request.displayName} color="initials" radius="xl" />
        <Text fw={500}>{request.displayName}</Text>
      </Group>
      <Text size="sm">
        承認すると、このLINEアカウントが一般ユーザー（メンバー）として登録され、次回ログインから利用できます。
      </Text>
      <Select
        label="インストラクター紐付け（任意）"
        placeholder="紐付けしない"
        searchable
        clearable
        data={(instructors ?? []).map((instructor) => ({
          value: instructor.id,
          label: `${instructor.lastName} ${instructor.firstName}${
            linkedIds.has(instructor.id) ? '（紐付け済み）' : ''
          }`,
          disabled: linkedIds.has(instructor.id),
        }))}
        value={instructorId}
        onChange={setInstructorId}
      />
      {approve.isError && <ErrorAlert>{approve.error.message}</ErrorAlert>}
      <Group justify="flex-end">
        <AppButton intent="secondary" onClick={onClose} disabled={approve.isPending}>
          キャンセル
        </AppButton>
        <AppButton intent="primary" loading={approve.isPending} onClick={submit}>
          承認する
        </AppButton>
      </Group>
    </Stack>
  );
}

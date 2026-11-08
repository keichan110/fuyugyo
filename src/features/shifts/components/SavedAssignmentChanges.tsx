import { Group, Stack, Text } from '@mantine/core';

import { AppBadge } from '@/components/AppBadge';

import type { AssignmentReviewDay } from './assignment-review';

type Props = {
  review: AssignmentReviewDay | undefined;
  nameById: ReadonlyMap<string, string>;
};

/** 選択枠の担当者について、保存済みから現在案への追加・解除を示す。 */
export function SavedAssignmentChanges({ review, nameById }: Props) {
  const changes = [
    { label: '追加', kind: 'link', ids: review?.addedIds ?? [] },
    { label: '解除', kind: 'danger', ids: review?.removedIds ?? [] },
  ] satisfies { label: string; kind: 'link' | 'danger'; ids: string[] }[];
  const changed = changes.some((change) => change.ids.length > 0);
  return (
    <Stack gap={6} mt="xs">
      <Text size="sm" fw={600}>
        保存済みからの担当者変更
      </Text>
      {changes
        .filter((change) => change.ids.length > 0)
        .map((change) => (
          <Group key={change.kind} gap="xs" align="flex-start" wrap="nowrap">
            <AppBadge kind={change.kind}>{change.label}</AppBadge>
            <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
              {change.ids.map((id) => nameById.get(id) ?? '名前未取得').join('・')}
            </Text>
          </Group>
        ))}
      {!changed && (
        <Text size="sm" c="dimmed">
          担当者の変更はありません。
        </Text>
      )}
      <Text size="xs" c="dimmed">
        自動割当と手動編集を含む、現在案と保存済みの比較です。
      </Text>
    </Stack>
  );
}

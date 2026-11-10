import { useMemo, useState } from 'react';

import { Card, Group, Modal, SimpleGrid, Stack, Text } from '@mantine/core';

import { AppButton } from '@/components/AppButton';
import { getDepartmentAppearance } from '@/features/departments/appearance';

import { shortDateLabel } from '../view-utils';
import { buildAssignmentChanges } from './assignment-changes';
import { SavedAssignmentChanges } from './SavedAssignmentChanges';
import { cellKey } from './shift-manager-utils';
import type { useShiftManagerController } from './useShiftManagerController';

type Props = { controller: ReturnType<typeof useShiftManagerController> };

/** カレンダーから担当部門・当月・表示中の種別の変更をまとめて確認する。 */
export function AssignmentChangesControl({ controller }: Props) {
  const [opened, setOpened] = useState(false);
  const savedRequirements = useMemo(
    () =>
      new Map(
        (controller.requirements.data ?? [])
          .filter((row) => row.departmentCode === controller.departmentCode)
          .map((row) => [cellKey(row.date, row.shiftTypeId), row.requiredCount]),
      ),
    [controller.requirements.data, controller.departmentCode],
  );
  const changes = useMemo(
    () =>
      buildAssignmentChanges({
        days: controller.days,
        shiftByCell: controller.shiftByCell,
        stagedCells: controller.stagedCells,
        savedRequirements,
        stagedRequirements: controller.stagedRequirements,
      }).filter((change) => change.shiftTypeId === controller.activeShiftTypeId),
    [
      controller.days,
      controller.activeShiftTypeId,
      controller.shiftByCell,
      controller.stagedCells,
      savedRequirements,
      controller.stagedRequirements,
    ],
  );
  const names = new Map(controller.nameById);
  for (const shift of controller.shiftByCell.values()) {
    for (const person of shift.assignedInstructors) names.set(person.id, person.displayName);
  }
  if (changes.length === 0) return null;
  return (
    <>
      <AppButton
        intent="secondary"
        size="xs"
        onClick={() => setOpened(true)}
        disabled={
          !controller.monthly.data ||
          !controller.requirementsReady ||
          controller.isAutoAssigning ||
          controller.autoAssignMode
        }
      >
        差分
      </AppButton>
      <Modal opened={opened} onClose={() => setOpened(false)} title="差分" size="xl" centered>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {controller.month} ／ {getDepartmentAppearance(controller.departmentCode).label}
          </Text>
          {changes.map((change) => (
            <Card key={change.key} withBorder padding="sm">
              <Stack gap="sm">
                <Text size="sm" fw={600}>
                  {shortDateLabel(change.date)}
                </Text>
                <SavedAssignmentChanges
                  addedIds={change.addedIds}
                  removedIds={change.removedIds}
                  assigned={change.currentIds.map((id) => ({
                    id,
                    name: names.get(id) ?? '名前未取得',
                  }))}
                  nameById={names}
                />
                {change.requiredChanged && (
                  <ChangedField
                    label="必要人数"
                    before={
                      change.beforeRequired === null ? '未設定' : `${change.beforeRequired}名`
                    }
                    after={change.afterRequired === null ? '未設定' : `${change.afterRequired}名`}
                  />
                )}
                {change.descriptionChanged && (
                  <ChangedField
                    label="備考"
                    before={change.beforeDescription || 'なし'}
                    after={change.afterDescription || 'なし'}
                  />
                )}
              </Stack>
            </Card>
          ))}
          <Group justify="flex-end">
            <AppButton intent="secondary" onClick={() => setOpened(false)}>
              閉じる
            </AppButton>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

/** 必要人数・備考の変更を保存済みと現在案の2列で比較する。 */
function ChangedField({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <Stack gap={4}>
      <Text size="sm" fw={600}>
        {label}
      </Text>
      <SimpleGrid cols={2} spacing="sm">
        <Stack gap={3}>
          <Text size="xs" c="dimmed">
            保存済み
          </Text>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {before}
          </Text>
        </Stack>
        <Stack gap={3}>
          <Text size="xs" c="dimmed">
            現在案
          </Text>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {after}
          </Text>
        </Stack>
      </SimpleGrid>
    </Stack>
  );
}

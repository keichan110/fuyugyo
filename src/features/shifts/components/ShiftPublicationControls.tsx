import { useState } from 'react';

import { Group, Modal, Stack, Text, TextInput } from '@mantine/core';

import { ErrorAlert } from '@/components/AppAlert';
import { AppButton } from '@/components/AppButton';
import { DEPARTMENT_LABELS, type DepartmentCode } from '@/features/departments/schema';

import { usePublishShifts } from '../queries';
import type { PublishShiftsInput, ShiftViewItem } from '../schema';
import type { StagedRequirements } from './requirement-stage';
import type { StagedCell } from './shift-manager-types';
import { cellKey } from './shift-manager-utils';

type Props = {
  month: string;
  departmentCode: DepartmentCode;
  shiftTypeId: string;
  shiftTypeName: string;
  days: string[];
  date?: string;
  shiftByCell: ReadonlyMap<string, ShiftViewItem>;
  stagedCells: ReadonlyMap<string, StagedCell>;
  stagedRequirements: StagedRequirements;
  disabled: boolean;
};

/** 指定日まで、または選択枠の保存済み計画を確認して公開・公開取り消しする。 */
export function ShiftPublicationControls({
  month,
  departmentCode,
  shiftTypeId,
  shiftTypeName,
  days,
  date,
  shiftByCell,
  stagedCells,
  stagedRequirements,
  disabled,
}: Props) {
  const [through, setThrough] = useState(days.at(-1) ?? '');
  const [confirmation, setConfirmation] = useState<PublishShiftsInput | null>(null);
  const publication = usePublishShifts();
  const selectedDays = date ? [date] : days.filter((day) => day <= through);
  const invalidThrough = !date && !days.includes(through);
  const hasUnsaved = selectedDays.some(
    (day) =>
      stagedCells.has(cellKey(day, shiftTypeId)) ||
      stagedRequirements.has(cellKey(day, shiftTypeId)),
  );
  const published = date
    ? shiftByCell.get(cellKey(date, shiftTypeId))?.status === 'PUBLISHED'
    : false;
  const targetDays = (status: 'DRAFT' | 'PUBLISHED') =>
    selectedDays.filter((day) => {
      const shift = shiftByCell.get(cellKey(day, shiftTypeId));
      return status === 'PUBLISHED' ? shift?.status !== 'PUBLISHED' : shift?.status === 'PUBLISHED';
    });
  const openConfirmation = (status: 'DRAFT' | 'PUBLISHED') => {
    publication.reset();
    setConfirmation({
      month,
      departmentCode,
      shiftTypeId,
      status,
      dates: targetDays(status).map((day) => ({
        date: day,
        expectedRevision: shiftByCell.get(cellKey(day, shiftTypeId))?.revision ?? null,
        expectedShiftId: shiftByCell.get(cellKey(day, shiftTypeId))?.id ?? null,
      })),
    });
  };
  const confirmedShifts =
    confirmation?.dates.map((item) => shiftByCell.get(cellKey(item.date, shiftTypeId))) ?? [];
  const zeroCount = confirmedShifts.filter((shift) => !shift?.assignedInstructors.length).length;
  const shortCount = confirmedShifts.filter(
    (shift) =>
      shift?.requiredCount !== null &&
      shift?.requiredCount !== undefined &&
      shift.assignedInstructors.length < shift.requiredCount,
  ).length;
  const blocked = disabled || publication.isPending || hasUnsaved || invalidThrough;

  return (
    <Stack gap="xs" mb="sm">
      <Group align="flex-end" gap="xs" wrap="wrap">
        {!date && (
          <TextInput
            type="date"
            label="公開期限（表示月の初日から）"
            min={days[0]}
            max={days.at(-1)}
            value={through}
            disabled={disabled || publication.isPending}
            onChange={(event) => setThrough(event.currentTarget.value)}
          />
        )}
        {date ? (
          <>
            <Text size="sm" fw={600}>
              {published ? '公開済み' : '下書き'}
            </Text>
            <AppButton
              intent={published ? 'danger' : 'secondary'}
              disabled={blocked}
              onClick={() => openConfirmation(published ? 'DRAFT' : 'PUBLISHED')}
            >
              {published ? '公開を取り消して編集' : '公開する'}
            </AppButton>
          </>
        ) : (
          <>
            <AppButton
              intent="secondary"
              disabled={blocked || targetDays('PUBLISHED').length === 0}
              onClick={() => openConfirmation('PUBLISHED')}
            >
              この日まで公開
            </AppButton>
            <AppButton
              intent="danger"
              disabled={blocked || targetDays('DRAFT').length === 0}
              onClick={() => openConfirmation('DRAFT')}
            >
              この日までの公開を取り消す
            </AppButton>
          </>
        )}
      </Group>
      {hasUnsaved && (
        <Text size="xs" c="dimmed">
          対象枠に未保存の変更があります。先に保存するか、変更を破棄してください。
        </Text>
      )}
      <Modal
        opened={confirmation !== null}
        onClose={() => !publication.isPending && setConfirmation(null)}
        closeOnClickOutside={!publication.isPending}
        closeOnEscape={!publication.isPending}
        withCloseButton={!publication.isPending}
        title={
          confirmation?.status === 'PUBLISHED' ? 'シフトを公開しますか？' : '公開を取り消しますか？'
        }
        centered
      >
        {confirmation && (
          <Stack gap="md">
            <Text>
              {DEPARTMENT_LABELS[departmentCode]} / {shiftTypeName}
            </Text>
            <Text>
              {confirmation.dates[0]?.date} 〜 {confirmation.dates.at(-1)?.date}：
              {confirmation.dates.length}枠（配置0名 {zeroCount}枠）
            </Text>
            {confirmation.status === 'PUBLISHED' ? (
              <>
                <Text size="sm">
                  メンバーに表示し、配置・必要人数・備考を確定します。配置0名の日も自動割当から保護します。
                </Text>
                {shortCount > 0 && (
                  <Text size="sm" c="yellow.8">
                    必要人数に対して不足している枠が{shortCount}枠あります。
                  </Text>
                )}
              </>
            ) : (
              <Text size="sm">
                配置と必要人数は保持します。再公開までメンバーには表示されず、自動割当の対象に戻ります。
              </Text>
            )}
            {publication.isError && <ErrorAlert>{publication.error.message}</ErrorAlert>}
            <Group justify="flex-end">
              <AppButton
                intent="secondary"
                disabled={publication.isPending}
                onClick={() => setConfirmation(null)}
              >
                キャンセル
              </AppButton>
              <AppButton
                intent={confirmation.status === 'PUBLISHED' ? 'primary' : 'danger'}
                loading={publication.isPending}
                onClick={() =>
                  publication.mutate(confirmation, { onSuccess: () => setConfirmation(null) })
                }
              >
                {confirmation.status === 'PUBLISHED' ? '公開する' : '公開を取り消す'}
              </AppButton>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}

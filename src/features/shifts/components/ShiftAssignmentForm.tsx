import type { ComponentProps, Ref } from 'react';

import { Box, Card, CloseButton, Group, Stack, Text, Title } from '@mantine/core';

import { AppBadge } from '@/components/AppBadge';

import { getCalendarDayColor, shortDateLabel } from '../view-utils';
import { AssignmentPanel } from './AssignmentPanel';
import { cellKey } from './shift-manager-utils';
import classes from './ShiftManager.module.css';
import { ShiftPublicationControls } from './ShiftPublicationControls';
import type { useShiftManagerController } from './useShiftManagerController';

type Props = {
  controller: ReturnType<typeof useShiftManagerController>;
  publicationProps: ComponentProps<typeof ShiftPublicationControls>;
  headingRef: Ref<HTMLHeadingElement>;
  focusedInstructorId: string | null;
  onClose: () => void;
  onAnalyzeInstructor: ComponentProps<typeof AssignmentPanel>['onAnalyzeInstructor'];
};

/** 選択枠の公開状態・担当者・必要人数を編集するフォームを表示する。 */
export function ShiftAssignmentForm({
  controller,
  publicationProps,
  headingRef,
  focusedInstructorId,
  onClose,
  onAnalyzeInstructor,
}: Props) {
  const selectedCell = controller.selectedCell;
  const selectedCellDateColor = selectedCell ? getCalendarDayColor(selectedCell.date) : undefined;
  const selectedPublished = selectedCell
    ? controller.shiftByCell.get(cellKey(selectedCell.date, selectedCell.shiftTypeId))?.status ===
      'PUBLISHED'
    : false;
  return (
    <Card
      withBorder
      padding="md"
      className={classes.assignmentForm}
      component="section"
      aria-label="枠の編集"
    >
      <Box className={classes.assignmentFormHeader}>
        <Group justify="space-between" mb="sm" align="flex-start">
          <Stack gap={2}>
            <Title
              ref={headingRef}
              tabIndex={-1}
              style={{ scrollMarginTop: 80 }}
              order={3}
              size="h4"
              c={selectedCellDateColor ?? 'inherit'}
            >
              {selectedCell ? shortDateLabel(selectedCell.date) : '枠の編集'}
            </Title>
            <Text size="xs" c="dimmed">
              {
                controller.formData.data?.shiftTypes.find(
                  (type) => type.id === controller.activeShiftTypeId,
                )?.name
              }
            </Text>
          </Stack>
          <Group gap="xs" wrap="nowrap">
            <Text size="sm">{controller.selectedAssignmentCount}名</Text>
            {(controller.selectedStagedCell || controller.selectedStagedRequirement) && (
              <AppBadge kind="pending">未保存</AppBadge>
            )}
            <CloseButton aria-label="編集フォームを閉じる" onClick={onClose} />
          </Group>
        </Group>
        {selectedCell && (
          <ShiftPublicationControls
            key={`single:${selectedCell.date}:${controller.departmentCode}:${selectedCell.shiftTypeId}`}
            {...publicationProps}
            date={selectedCell.date}
          />
        )}
      </Box>
      <Box className={classes.assignmentFormBody}>
        {selectedPublished && (
          <Text size="sm" c="dimmed" mb="sm">
            公開済みのため編集できません。変更するには公開を取り消してください。
          </Text>
        )}
        {controller.autoAssignMode && (
          <Text size="sm" c="dimmed" mb="sm">
            自動割当の日付選択中は手動編集できません。編集するには自動割当をキャンセルしてください。
          </Text>
        )}
        <Box
          component="fieldset"
          disabled={controller.autoAssignMode || controller.isAutoAssigning}
          className={classes.assignmentFields}
        >
          {selectedCell && (
            <AssignmentPanel
              key={`${selectedCell.date}-${controller.departmentCode}-${selectedCell.shiftTypeId}`}
              readOnly={selectedPublished}
              date={selectedCell.date}
              departmentCode={controller.departmentCode}
              shiftTypeId={selectedCell.shiftTypeId}
              stagedCell={controller.stagedCells.get(
                cellKey(selectedCell.date, selectedCell.shiftTypeId),
              )}
              onStageChange={(next) =>
                controller.stageCell(cellKey(selectedCell.date, selectedCell.shiftTypeId), next)
              }
              requirementsReady={controller.requirementsReady}
              requiredCount={controller.selectedRequiredCount}
              onRequiredCountChange={(value) =>
                controller.stageRequirement(selectedCell.date, selectedCell.shiftTypeId, value)
              }
              onRegisterInstructorNames={controller.registerInstructorNames}
              conflictLabelById={controller.conflictLabelById}
              currentMonthWorkDays={controller.currentMonthWorkDays}
              availabilities={controller.availabilities.data ?? []}
              focusedInstructorId={focusedInstructorId}
              onAnalyzeInstructor={onAnalyzeInstructor}
            />
          )}
        </Box>
      </Box>
    </Card>
  );
}

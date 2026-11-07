import { useState } from 'react';

import { Box, Card, CloseButton, Group, Select, Stack, Text, Title } from '@mantine/core';

import { ErrorAlert } from '@/components/AppAlert';
import { AppBadge } from '@/components/AppBadge';
import { UnsavedChangesBar } from '@/components/UnsavedChangesBar';
import { useMe } from '@/features/auth/queries';
import { getDepartmentAppearance } from '@/features/departments/appearance';
import { DepartmentTag } from '@/features/departments/DepartmentTag';
import { departmentCodeSchema } from '@/features/departments/schema';

import { getCalendarDayColor, shortDateLabel, toMonth } from '../view-utils';
import { AssignmentPanel } from './AssignmentPanel';
import { cellKey } from './shift-manager-utils';
import { ShiftAnalysis } from './ShiftAnalysis';
import { ShiftCalendar } from './ShiftCalendar';
import classes from './ShiftManager.module.css';
import { ShiftManagerDialogs } from './ShiftManagerDialogs';
import { useShiftManagerController } from './useShiftManagerController';

/** シフト枠（日付 × 部門 × シフト種別）を月間シフト表で編集する管理コンポーネント。 */
export function ShiftManager() {
  const controller = useShiftManagerController();
  const me = useMe();

  return (
    <ShiftManagerContent
      key={`${controller.month}:${controller.departmentCode}:${controller.activeShiftTypeId}`}
      controller={controller}
      myInstructorId={me.data?.instructorId ?? null}
    />
  );
}

type ShiftManagerContentProps = {
  controller: ReturnType<typeof useShiftManagerController>;
  myInstructorId: string | null;
};

/** シフト管理画面の表示と各編集コントロールを組み立てる。 */
function ShiftManagerContent({ controller, myInstructorId }: ShiftManagerContentProps) {
  const selectedCell = controller.selectedCell;
  const [focusedInstructor, setFocusedInstructor] = useState<{ id: string; name: string } | null>(
    null,
  );
  const selectedCellDateColor = controller.selectedCell
    ? getCalendarDayColor(controller.selectedCell.date)
    : undefined;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={2}>シフト管理</Title>
        <Select
          label="部門"
          disabled={controller.isAutoAssigning}
          data={departmentCodeSchema.options.map((code) => ({
            value: code,
            label: getDepartmentAppearance(code).label,
          }))}
          value={controller.departmentCode}
          onChange={(value) => {
            if (!value || value === controller.departmentCode) return;
            const parsed = departmentCodeSchema.safeParse(value);
            if (parsed.success) {
              controller.requestNavigation({ type: 'department', nextDepartmentCode: parsed.data });
            }
          }}
          renderOption={({ option }) => <DepartmentTag code={option.value} name={option.label} />}
          leftSection={(() => {
            const SelectedIcon = getDepartmentAppearance(controller.departmentCode).icon;
            return <SelectedIcon size={16} stroke={1.75} />;
          })()}
          allowDeselect={false}
          w={{ base: '100%', sm: 280 }}
        />
      </Group>

      {controller.formData.isLoading && (
        <Text c="dimmed" size="sm">
          読み込み中…
        </Text>
      )}
      {controller.formData.isError && <ErrorAlert>フォームデータの取得に失敗しました</ErrorAlert>}
      {controller.requirements.isError && (
        <ErrorAlert>
          {controller.requirements.error?.message ?? '必要人数の取得に失敗しました'}
        </ErrorAlert>
      )}
      {controller.monthly.isError && (
        <ErrorAlert>
          {controller.monthly.error?.message ?? '月次シフトの取得に失敗しました'}
        </ErrorAlert>
      )}

      {controller.formData.data && (
        <>
          {controller.isDirty && (
            <UnsavedChangesBar
              count={controller.dirtyCount}
              description="表示中の月のシフト割当と必要人数をまとめて保存します"
              loading={controller.upsertMonthly.isPending || controller.isAutoAssigning}
              saveLabel="一括保存"
              onCancel={controller.resetStage}
              onSave={controller.saveMonthly}
            />
          )}
          {controller.upsertMonthly.isError && (
            <ErrorAlert>
              {controller.upsertMonthly.error?.message ?? '保存に失敗しました'}
            </ErrorAlert>
          )}

          <Box
            className={classes.workspace}
            data-panel-opened={controller.assignmentPanelOpened || undefined}
          >
            <ShiftCalendar
              month={controller.month}
              onMonthChange={(nextMonth) =>
                controller.requestNavigation({ type: 'month', nextMonth: toMonth(nextMonth) })
              }
              days={controller.days}
              departmentCode={controller.departmentCode}
              shiftTypes={controller.formData.data.shiftTypes}
              activeShiftTypeId={controller.activeShiftTypeId}
              onChangeShiftType={controller.changeActiveShiftType}
              stagedShiftTypeIds={controller.stagedShiftTypeIds}
              shiftByCell={controller.shiftByCell}
              assignmentsByDay={controller.assignmentsByDay}
              staffingSummary={controller.staffingSummary}
              focusedInstructor={focusedInstructor}
              onClearInstructor={() => setFocusedInstructor(null)}
              stagedCells={controller.stagedCells}
              selectedCell={controller.selectedCell}
              myInstructorId={myInstructorId}
              onSelectCell={controller.openAssignmentPanel}
              autoAssignMode={controller.autoAssignMode}
              autoAssignDates={controller.autoAssignDates}
              onStartAutoAssign={controller.startAutoAssign}
              onCancelAutoAssign={() => controller.setAutoAssignMode(false)}
              onToggleAutoAssignDate={(date) =>
                controller.setAutoAssignDates((current) => {
                  const next = new Set(current);
                  if (next.has(date)) next.delete(date);
                  else next.add(date);
                  return next;
                })
              }
              onRunAutoAssign={controller.runAutoAssign}
              isAutoAssigning={controller.isAutoAssigning}
              canRunAutoAssign={
                !!controller.autoAssignContext.data &&
                controller.requirementsReady &&
                !controller.activeShiftTypeMissingCertification
              }
              missingCertification={controller.activeShiftTypeMissingCertification}
              noSelectableDates={controller.hasNoAutoAssignSelectableDates}
              shortageByCell={controller.shortageByCell}
              compositionByDay={controller.compositionByDay}
              stagedRequirements={controller.stagedRequirements}
              requiredByDay={controller.requiredByDay}
              isAutoAssignSelectableDate={controller.isAutoAssignSelectableDate}
              onOpenBulkModal={() => controller.setBulkModalOpened(true)}
            />

            <Card
              withBorder
              padding="md"
              className={classes.assignmentForm}
              component="section"
              aria-label="枠の編集"
            >
              <Group justify="space-between" mb="md" align="flex-start">
                <Stack gap={2}>
                  <Title order={3} size="h4" c={selectedCellDateColor ?? 'inherit'}>
                    {selectedCell ? shortDateLabel(selectedCell.date) : '枠の編集'}
                  </Title>
                  <Text size="xs" c="dimmed">
                    {
                      controller.formData.data.shiftTypes.find(
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
                  <CloseButton
                    aria-label="編集フォームを閉じる"
                    onClick={() => controller.setAssignmentPanelOpened(false)}
                  />
                </Group>
              </Group>
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
                    date={selectedCell.date}
                    departmentCode={controller.departmentCode}
                    shiftTypeId={selectedCell.shiftTypeId}
                    stagedCell={controller.stagedCells.get(
                      cellKey(selectedCell.date, selectedCell.shiftTypeId),
                    )}
                    onStageChange={(next) =>
                      controller.stageCell(
                        cellKey(selectedCell.date, selectedCell.shiftTypeId),
                        next,
                      )
                    }
                    requirementsReady={controller.requirementsReady}
                    requiredCount={controller.selectedRequiredCount}
                    onRequiredCountChange={(value) =>
                      controller.stageRequirement(
                        selectedCell.date,
                        selectedCell.shiftTypeId,
                        value,
                      )
                    }
                    onRegisterInstructorNames={controller.registerInstructorNames}
                    conflictLabelById={controller.conflictLabelById}
                    currentMonthWorkDays={controller.currentMonthWorkDays}
                    availabilities={controller.availabilities.data ?? []}
                    focusedInstructorId={focusedInstructor?.id ?? null}
                    onAnalyzeInstructor={(instructor) =>
                      setFocusedInstructor((current) =>
                        current?.id === instructor.id ? null : instructor,
                      )
                    }
                  />
                )}
              </Box>
            </Card>
          </Box>
          <ShiftAnalysis
            key={focusedInstructor?.id ?? 'overview'}
            month={controller.month}
            departmentCode={controller.departmentCode}
            shiftTypeName={
              controller.formData.data.shiftTypes.find(
                (type) => type.id === controller.activeShiftTypeId,
              )?.name ?? ''
            }
            days={controller.days}
            assignmentsByDay={controller.assignmentsByDay}
            assignmentsReady={controller.monthly.data !== undefined}
            staffingSummary={controller.staffingSummary}
            shortageByCell={controller.shortageByCell}
            compositionByDay={controller.compositionByDay}
            navigationDisabled={controller.autoAssignMode || controller.isAutoAssigning}
            requiredByDay={controller.requiredByDay}
            selectedCell={selectedCell}
            selectedDescription={
              controller.selectedStagedCell?.description ??
              controller.shiftByCell.get(
                cellKey(selectedCell?.date ?? '', controller.activeShiftTypeId),
              )?.description ??
              ''
            }
            focusedInstructor={focusedInstructor}
            onClearInstructor={() => setFocusedInstructor(null)}
            onSelectDate={(date) =>
              controller.openAssignmentPanel({ date, shiftTypeId: controller.activeShiftTypeId })
            }
          />
        </>
      )}

      <ShiftManagerDialogs controller={controller} />
    </Stack>
  );
}

import { useRef, useState } from 'react';

import { Box, Group, Select, Stack, Text, Title } from '@mantine/core';

import { ErrorAlert } from '@/components/AppAlert';
import { UnsavedChangesBar } from '@/components/UnsavedChangesBar';
import { useMe } from '@/features/auth/queries';
import { getDepartmentAppearance } from '@/features/departments/appearance';
import type { DepartmentCode } from '@/features/departments/schema';

import { cellKey } from './shift-manager-utils';
import { ShiftAnalysis } from './ShiftAnalysis';
import { ShiftAssignmentForm } from './ShiftAssignmentForm';
import classes from './ShiftManager.module.css';
import { ShiftManagerCalendar } from './ShiftManagerCalendar';
import { ShiftManagerDialogs } from './ShiftManagerDialogs';
import { useShiftManagerController } from './useShiftManagerController';

/** シフト枠（日付 × 部門 × シフト種別）を月間シフト表で編集する管理コンポーネント。 */
export function ShiftManager({ departmentCode }: { departmentCode: DepartmentCode }) {
  const controller = useShiftManagerController(departmentCode);
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
  const analysisHeadingRef = useRef<HTMLHeadingElement>(null);
  const [analysisOpened, setAnalysisOpened] = useState(true);
  const assignmentHeadingRef = useRef<HTMLHeadingElement>(null);
  const [analysisTab, setAnalysisTab] = useState<string | null>('month');
  const openAssignmentPanel: typeof controller.openAssignmentPanel = (cell) => {
    controller.openAssignmentPanel(cell);
    setAnalysisTab((current) => (current === 'person' ? 'person' : 'slot'));
  };
  const clearInstructor = () => {
    setFocusedInstructor(null);
    setAnalysisTab(controller.assignmentPanelOpened ? 'slot' : 'month');
  };
  const [focusedInstructor, setFocusedInstructor] = useState<{ id: string; name: string } | null>(
    null,
  );
  const publicationProps = {
    month: controller.month,
    departmentCode: controller.departmentCode,
    shiftTypeId: controller.activeShiftTypeId,
    shiftTypeName:
      controller.formData.data?.shiftTypes.find((type) => type.id === controller.activeShiftTypeId)
        ?.name ?? '',
    days: controller.days,
    shiftByCell: controller.shiftByCell,
    stagedCells: controller.stagedCells,
    stagedRequirements: controller.stagedRequirements,
    disabled:
      controller.autoAssignMode ||
      controller.isAutoAssigning ||
      controller.upsertMonthly.isPending ||
      !controller.monthly.data ||
      !controller.requirementsReady,
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Title order={2}>
          {getDepartmentAppearance(controller.departmentCode).label}のシフト管理
        </Title>
        <Select
          label="勤務種別"
          data={(controller.formData.data?.shiftTypes ?? []).map((type) => ({
            value: type.id,
            label: type.name,
          }))}
          value={controller.activeShiftTypeId || null}
          disabled={controller.isAutoAssigning || !controller.formData.data}
          allowDeselect={false}
          onChange={(value) => {
            if (value && value !== controller.activeShiftTypeId)
              controller.changeActiveShiftType(value);
          }}
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
              description="表示中の月の配置と必要人数を下書きとして保存します。メンバーには公開されません"
              loading={controller.upsertMonthly.isPending || controller.isAutoAssigning}
              saveLabel="下書きを保存"
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
            <ShiftManagerCalendar
              controller={controller}
              publicationProps={publicationProps}
              myInstructorId={myInstructorId}
              focusedInstructor={focusedInstructor}
              onClearInstructor={clearInstructor}
              onSelectCell={openAssignmentPanel}
              onDeselect={() => {
                controller.setAssignmentPanelOpened(false);
                setAnalysisTab((current) => (current === 'person' ? 'person' : 'month'));
              }}
            />

            <ShiftAssignmentForm
              controller={controller}
              publicationProps={publicationProps}
              headingRef={assignmentHeadingRef}
              focusedInstructorId={focusedInstructor?.id ?? null}
              onClose={() => {
                controller.setAssignmentPanelOpened(false);
                setAnalysisTab((current) => (current === 'person' ? 'person' : 'month'));
              }}
              onAnalyzeInstructor={(instructor) => {
                if (focusedInstructor?.id === instructor.id) {
                  clearInstructor();
                } else {
                  setFocusedInstructor(instructor);
                  setAnalysisTab('person');
                  setAnalysisOpened(true);
                  requestAnimationFrame(() => {
                    analysisHeadingRef.current?.focus({ preventScroll: true });
                    analysisHeadingRef.current?.scrollIntoView({ block: 'start' });
                  });
                }
              }}
            />
          </Box>
          <ShiftAnalysis
            headingRef={analysisHeadingRef}
            opened={analysisOpened}
            onOpenedChange={setAnalysisOpened}
            tab={analysisTab}
            onTabChange={setAnalysisTab}
            month={controller.month}
            departmentCode={controller.departmentCode}
            shiftTypeName={
              controller.formData.data.shiftTypes.find(
                (type) => type.id === controller.activeShiftTypeId,
              )?.name ?? ''
            }
            activeShiftTypeId={controller.activeShiftTypeId}
            context={controller.autoAssignContext.data}
            availabilities={controller.availabilities.data}
            reviewFailed={
              controller.autoAssignContext.isError ||
              controller.availabilities.isError ||
              controller.requirements.isError
            }
            nameById={controller.nameById}
            savedAssignments={controller.detailedAssignments.saved}
            stagedAssignments={controller.detailedAssignments.staged}
            days={controller.days}
            assignmentsByDay={controller.assignmentsByDay}
            assignmentsReady={controller.monthly.data !== undefined}
            staffingSummary={controller.staffingSummary}
            compositionByDay={controller.compositionByDay}
            navigationDisabled={controller.autoAssignMode || controller.isAutoAssigning}
            requiredByDay={controller.requiredByDay}
            selectedCell={controller.assignmentPanelOpened ? selectedCell : null}
            streakBaseDate={controller.assignmentPanelOpened ? (selectedCell?.date ?? null) : null}
            selectedDescription={
              controller.selectedStagedCell?.description ??
              controller.shiftByCell.get(
                cellKey(selectedCell?.date ?? '', controller.activeShiftTypeId),
              )?.description ??
              ''
            }
            focusedInstructor={focusedInstructor}
            onClearInstructor={clearInstructor}
            onChangeDate={(date) =>
              openAssignmentPanel({ date, shiftTypeId: controller.activeShiftTypeId })
            }
            onClearDate={() => {
              controller.setAssignmentPanelOpened(false);
              setAnalysisTab(focusedInstructor ? 'person' : 'month');
            }}
            onSelectInstructor={(person) => {
              setFocusedInstructor(person);
              setAnalysisTab('person');
            }}
            onInspectDate={(date) =>
              controller.openAssignmentPanel({ date, shiftTypeId: controller.activeShiftTypeId })
            }
            onSelectDate={(date) => {
              controller.openAssignmentPanel({ date, shiftTypeId: controller.activeShiftTypeId });
              setAnalysisTab('slot');
              requestAnimationFrame(() => {
                assignmentHeadingRef.current?.focus({ preventScroll: true });
                assignmentHeadingRef.current?.scrollIntoView({ block: 'start' });
              });
            }}
          />
        </>
      )}

      <ShiftManagerDialogs controller={controller} />
    </Stack>
  );
}

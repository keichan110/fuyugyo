import type { ComponentProps } from 'react';

import { toMonth } from '../view-utils';
import { AssignmentChangesControl } from './AssignmentChangesControl';
import { ShiftCalendar } from './ShiftCalendar';
import { ShiftPublicationControls } from './ShiftPublicationControls';
import type { useShiftManagerController } from './useShiftManagerController';

type Props = {
  controller: ReturnType<typeof useShiftManagerController>;
  publicationProps: ComponentProps<typeof ShiftPublicationControls>;
  myInstructorId: string | null;
  focusedInstructor: ComponentProps<typeof ShiftCalendar>['focusedInstructor'];
  onClearInstructor: () => void;
  onDeselect: () => void;
  onSelectCell: ComponentProps<typeof ShiftCalendar>['onSelectCell'];
};

/** 月間カレンダーの表示に、編集・自動割当・公開の操作を接続する。 */
export function ShiftManagerCalendar({
  controller,
  publicationProps,
  myInstructorId,
  focusedInstructor,
  onClearInstructor,
  onSelectCell,
  onDeselect,
}: Props) {
  return (
    <ShiftCalendar
      differenceControl={<AssignmentChangesControl controller={controller} />}
      publicationControls={
        <ShiftPublicationControls
          key={`${controller.month}:${controller.departmentCode}:${controller.activeShiftTypeId}`}
          {...publicationProps}
        />
      }
      month={controller.month}
      onMonthChange={(nextMonth) =>
        controller.requestNavigation({ type: 'month', nextMonth: toMonth(nextMonth) })
      }
      days={controller.days}
      activeShiftTypeId={controller.activeShiftTypeId}
      shiftByCell={controller.shiftByCell}
      assignmentsByDay={controller.assignmentsByDay}
      availabilities={controller.availabilities.data}
      availabilityFailed={controller.availabilities.isError}
      focusedInstructor={focusedInstructor}
      onClearInstructor={onClearInstructor}
      stagedCells={controller.stagedCells}
      selectedCell={controller.assignmentPanelOpened ? controller.selectedCell : null}
      myInstructorId={myInstructorId}
      onSelectCell={onSelectCell}
      onDeselect={onDeselect}
      autoAssignMode={controller.autoAssignMode}
      autoAssignDates={controller.autoAssignDates}
      onStartAutoAssign={controller.startAutoAssign}
      onCancelAutoAssign={() => controller.setAutoAssignMode(false)}
      onToggleAutoAssignDate={(date) =>
        controller.setAutoAssignDates((current) => {
          const next = new Set(current);
          if (next.has(date)) {
            next.delete(date);
          } else {
            next.add(date);
          }
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
  );
}

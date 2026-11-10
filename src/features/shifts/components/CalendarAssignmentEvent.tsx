import type { CSSProperties } from 'react';

import { Box } from '@mantine/core';
import type { ScheduleEventData } from '@mantine/schedule';

import type { Availability } from '@/features/availabilities/schema';

import { AssignedAvailabilityIcon } from './AssignedAvailabilityIcon';
import { isHeaderEventPayload } from './calendar-events';
import { DayHeaderLayer } from './DayHeaderLayer';
import classes from './ShiftManager.module.css';

type Props = {
  event: ScheduleEventData;
  style: CSSProperties | undefined;
  focusedInstructorId: string | null;
  myInstructorId: string | null;
  availabilityByPersonDay: ReadonlyMap<string, Availability> | undefined;
  availabilityFailed: boolean;
};

/** 日付の状態層、または配置者名と勤務可否をカレンダーの同じ行内に表示する。 */
export function CalendarAssignmentEvent({
  event,
  style,
  focusedInstructorId,
  myInstructorId,
  availabilityByPersonDay,
  availabilityFailed,
}: Props) {
  const payload = event.payload;
  if (isHeaderEventPayload(payload)) {
    return <DayHeaderLayer payload={payload} style={style} />;
  }
  return (
    <Box
      style={style}
      className={classes.instructorEvent}
      data-focused={
        (payload?.kind === 'instructor' && payload.instructorId === focusedInstructorId) ||
        undefined
      }
      data-dimmed={
        (focusedInstructorId !== null &&
          payload?.kind === 'instructor' &&
          payload.instructorId !== focusedInstructorId) ||
        undefined
      }
      data-current-user={
        (payload?.kind === 'instructor' && payload.instructorId === myInstructorId) || undefined
      }
    >
      <span className={classes.instructorEventName}>{event.title}</span>
      {payload?.kind === 'instructor' && (
        <AssignedAvailabilityIcon
          availability={availabilityByPersonDay?.get(`${payload.instructorId}:${payload.date}`)}
          ready={availabilityByPersonDay !== undefined}
          failed={availabilityFailed}
        />
      )}
    </Box>
  );
}

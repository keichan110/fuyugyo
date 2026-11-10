import { useMemo } from 'react';

import type { Availability } from '@/features/availabilities/schema';

import { availabilityDisplay } from './availability-display';
import type { DayAssignments } from './calendar-events';

/** 申告を人・日付で索引化し、日付セルの勤務可否の説明も同じ状態から作る。 */
export function useCalendarAvailability(
  availabilities: Availability[] | undefined,
  availabilityFailed: boolean,
  assignmentsByDay: DayAssignments,
) {
  const availabilityByPersonDay = useMemo(
    () =>
      availabilities === undefined
        ? undefined
        : new Map(availabilities.map((item) => [`${item.instructorId}:${item.date}`, item])),
    [availabilities],
  );
  const describeDayAvailability = (date: string) =>
    (assignmentsByDay.get(date) ?? [])
      .map(
        (person) =>
          `${person.name}：${availabilityDisplay(availabilityByPersonDay?.get(`${person.id}:${date}`), availabilityByPersonDay !== undefined, availabilityFailed).label}`,
      )
      .join(' / ');
  return { availabilityByPersonDay, describeDayAvailability };
}

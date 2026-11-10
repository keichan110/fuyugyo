import { Group } from '@mantine/core';
import { ScheduleHeader } from '@mantine/schedule';
import dayjs from 'dayjs';

import { todayString } from '../view-utils';
import { CalendarDisplayKey } from './CalendarDisplayKey';
import classes from './ShiftManager.module.css';

type Props = {
  month: string;
  disabled: boolean;
  onMonthChange: (date: string) => void;
};

/** 月移動と今日・表示の見方を同じ行に配置し、補助操作を右端に固定する。 */
export function ShiftCalendarHeader({ month, disabled, onMonthChange }: Props) {
  const date = dayjs(`${month}-01`);
  return (
    <ScheduleHeader
      className={classes.calendarHeader}
      labels={{
        previous: '前月',
        next: '翌月',
        today: '今日',
        selectMonth: '月を選択',
        selectYear: '年を選択',
        month: '月',
      }}
    >
      <Group gap={4} wrap="nowrap">
        <ScheduleHeader.Previous
          disabled={disabled}
          onClick={() => onMonthChange(date.subtract(1, 'month').format('YYYY-MM-DD'))}
        />
        <ScheduleHeader.MonthYearSelect
          locale="ja"
          yearValue={date.year()}
          monthValue={date.month()}
          onYearChange={(year) => onMonthChange(date.year(year).format('YYYY-MM-DD'))}
          onMonthChange={(nextMonth) => onMonthChange(date.month(nextMonth).format('YYYY-MM-DD'))}
          labelFormat={(value) => `${value.slice(0, 4)}年${Number(value.slice(5, 7))}月`}
          monthsListFormat={(value) => `${Number(value.slice(5, 7))}月`}
          disabled={disabled}
          miw={0}
          w={{ base: 104, sm: 140 }}
        />
        <ScheduleHeader.Next
          disabled={disabled}
          onClick={() => onMonthChange(date.add(1, 'month').format('YYYY-MM-DD'))}
        />
      </Group>
      <ScheduleHeader.Today
        disabled={disabled}
        px={6}
        onClick={() => onMonthChange(todayString())}
      />
      <Group ml="auto" wrap="nowrap">
        <CalendarDisplayKey />
      </Group>
    </ScheduleHeader>
  );
}

import { Group, Select } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

import { AppButton } from '@/components/AppButton';

import type { AutoAssignContext } from '../schema';
import { shortDateLabel } from '../view-utils';
import type { DayAssignments } from './calendar-events';

type DateControlsProps = {
  date: string;
  days: string[];
  disabled: boolean;
  onChangeDate: (date: string) => void;
  onClearDate: () => void;
};

/** 分析を表示したまま当月の日付を切り替え、選択を解除する操作。 */
export function AnalysisDateControls({
  date,
  days,
  disabled,
  onChangeDate,
  onClearDate,
}: DateControlsProps) {
  const index = days.indexOf(date);
  const previous = days[index - 1];
  const next = days[index + 1];
  return (
    <Group gap="xs">
      <AppButton
        intent="secondary"
        size="compact-xs"
        aria-label="前日の分析"
        disabled={disabled || !previous}
        onClick={() => previous && onChangeDate(previous)}
      >
        <IconChevronLeft size={14} />
      </AppButton>
      <Select
        aria-label="分析する日付"
        size="xs"
        w={160}
        value={date}
        data={days.map((day) => ({ value: day, label: shortDateLabel(day) }))}
        disabled={disabled}
        allowDeselect={false}
        onChange={(value) => {
          if (value) onChangeDate(value);
        }}
      />
      <AppButton
        intent="secondary"
        size="compact-xs"
        aria-label="翌日の分析"
        disabled={disabled || !next}
        onClick={() => next && onChangeDate(next)}
      >
        <IconChevronRight size={14} />
      </AppButton>
      <AppButton intent="secondary" size="compact-xs" disabled={disabled} onClick={onClearDate}>
        解除
      </AppButton>
    </Group>
  );
}

type PersonControlsProps = {
  person: { id: string; name: string };
  context: AutoAssignContext | undefined;
  shiftTypeId: string;
  assignmentsByDay: DayAssignments;
  disabled: boolean;
  onChangePerson: (person: { id: string; name: string }) => void;
  onClearPerson: () => void;
};

/** 候補者と当月の配置者から分析対象を検索・変更し、選択を解除する操作。 */
export function AnalysisPersonControls({
  person,
  context,
  shiftTypeId,
  assignmentsByDay,
  disabled,
  onChangePerson,
  onClearPerson,
}: PersonControlsProps) {
  const eligible = new Set(
    context?.frames.find((frame) => frame.shiftTypeId === shiftTypeId)?.eligibleInstructorIds,
  );
  const people = new Map(
    context?.instructors
      .filter((item) => eligible.has(item.id))
      .map((item) => [item.id, item.displayName]),
  );
  for (const assigned of assignmentsByDay.values()) {
    for (const item of assigned) people.set(item.id, item.name);
  }
  people.set(person.id, person.name);
  const options = [...people]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  return (
    <Group gap="xs">
      <Select
        aria-label="分析する人"
        size="xs"
        w={220}
        maw="100%"
        searchable
        value={person.id}
        data={options}
        disabled={disabled}
        allowDeselect={false}
        onChange={(id) => {
          const name = id ? people.get(id) : undefined;
          if (id && name && id !== person.id) onChangePerson({ id, name });
        }}
      />
      <AppButton intent="secondary" size="compact-xs" disabled={disabled} onClick={onClearPerson}>
        解除
      </AppButton>
    </Group>
  );
}

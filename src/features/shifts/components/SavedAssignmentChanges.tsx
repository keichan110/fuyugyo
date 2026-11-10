import { Stack, Text } from '@mantine/core';

import classes from './assignment-review.module.css';

type Props = {
  addedIds: string[];
  removedIds: string[];
  assigned: { id: string; name: string }[];
  nameById: ReadonlyMap<string, string>;
};

/** 保存済みと現在案を左右に並べ、共通の担当者の行を揃えて追加・解除を示す。 */
export function SavedAssignmentChanges({ addedIds, removedIds, assigned, nameById }: Props) {
  const added = new Set(addedIds);
  const unchanged = assigned.filter((person) => !added.has(person.id));
  if (addedIds.length + removedIds.length === 0) return null;
  const rows = [
    ...unchanged.map((person) => ({ before: person.id, after: person.id, changed: false })),
    ...Array.from({ length: Math.max(addedIds.length, removedIds.length) }, (_, index) => ({
      before: removedIds[index],
      after: addedIds[index],
      changed: true,
    })),
  ];
  const currentNames = new Map(assigned.map((person) => [person.id, person.name]));
  const name = (id: string) => currentNames.get(id) ?? nameById.get(id) ?? '名前未取得';

  return (
    <Stack gap={6} mt="xs">
      <Text size="sm" fw={600}>
        担当者
      </Text>
      <div className={classes.diff} role="group" aria-label="保存済みと現在案の担当者比較">
        <Text size="xs" c="dimmed">
          保存済み
        </Text>
        <Text size="xs" c="dimmed">
          現在案
        </Text>
        {rows.map((row) => (
          <div className={classes.diffRow} key={`${row.before ?? ''}:${row.after ?? ''}`}>
            <div
              className={classes.diffName}
              data-change={row.changed && row.before ? 'removed' : undefined}
            >
              {row.before && (
                <>
                  <span className={classes.diffMarker}>{row.changed ? '−' : ''}</span>
                  {name(row.before)}
                </>
              )}
            </div>
            <div
              className={classes.diffName}
              data-change={row.changed && row.after ? 'added' : undefined}
            >
              {row.after && (
                <>
                  <span className={classes.diffMarker}>{row.changed ? '+' : ''}</span>
                  {name(row.after)}
                </>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <>
            <Text size="sm" c="dimmed">
              未配置
            </Text>
            <Text size="sm" c="dimmed">
              未配置
            </Text>
          </>
        )}
      </div>
    </Stack>
  );
}

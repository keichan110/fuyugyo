import { Skeleton, Stack } from '@mantine/core';

type TableRowsSkeletonProps = {
  /** 表示するスケルトン行数(既定値: 5) */
  rows?: number;
};

/**
 * 一覧テーブルのローディング中に表示するスケルトン行。
 */
export function TableRowsSkeleton({ rows = 5 }: TableRowsSkeletonProps) {
  return (
    <Stack gap="xs">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={52} radius="sm" />
      ))}
    </Stack>
  );
}

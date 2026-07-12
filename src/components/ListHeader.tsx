import type { ReactNode } from 'react';

import { Group, Text, Title } from '@mantine/core';

type ListCountSummary = {
  /** 現在の検索・絞り込み条件に一致する件数 */
  count: number;
  /** 件数の単位 */
  unit: string;
};

type ListHeaderProps = {
  /** 一覧画面のタイトル */
  title: string;
  /** 現在の検索・絞り込み条件に一致する件数と単位 */
  summary?: ListCountSummary;
  /** 件数サマリを読み込み中として隠すかどうか */
  isLoading?: boolean;
  /** 右上に表示する追加ボタンなどの操作 */
  action?: ReactNode;
};

/**
 * 一覧画面のタイトル、現在の表示件数、右上操作を配置するヘッダー。
 */
export function ListHeader({ title, summary, isLoading = false, action }: ListHeaderProps) {
  return (
    <Group justify="space-between" align="flex-start">
      <div>
        <Title order={2}>{title}</Title>
        {!isLoading && summary && (
          <Text c="dimmed" size="sm">
            {summary.count}
            {summary.unit}
          </Text>
        )}
      </div>
      {action}
    </Group>
  );
}

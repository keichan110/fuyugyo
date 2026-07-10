import type { ReactNode } from 'react';

import { Group, Text, Title } from '@mantine/core';

type ListHeaderProps = {
  /** 一覧画面のタイトル */
  title: string;
  /** 全体件数 */
  total?: number;
  /** アクティブ件数 */
  active?: number;
  /** 件数の単位 */
  unit: string;
  /** 件数サマリを読み込み中として隠すかどうか */
  isLoading?: boolean;
  /** 右上に表示する追加ボタンなどの操作 */
  action?: ReactNode;
};

/**
 * 一覧画面のタイトル、件数サマリ、右上操作を配置するヘッダー。
 */
export function ListHeader({ title, total, active, unit, isLoading = false, action }: ListHeaderProps) {
  return (
    <Group justify="space-between" align="flex-start">
      <div>
        <Title order={2}>{title}</Title>
        {!isLoading && total !== undefined && active !== undefined && (
          <Text c="dimmed" size="sm">
            全{total}
            {unit}（アクティブ{active}
            {unit}）
          </Text>
        )}
      </div>
      {action}
    </Group>
  );
}

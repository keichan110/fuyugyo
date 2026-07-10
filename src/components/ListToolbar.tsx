import type { ReactNode } from 'react';

import { Group, type GroupProps } from '@mantine/core';

type ListToolbarProps = GroupProps & {
  /** 検索欄やフィルタなど、一覧の操作部品 */
  children: ReactNode;
};

/**
 * 一覧画面で検索欄やフィルタを横並びに配置するツールバー。
 */
export function ListToolbar({ children, ...props }: ListToolbarProps) {
  return (
    <Group justify="space-between" wrap="wrap" {...props}>
      {children}
    </Group>
  );
}

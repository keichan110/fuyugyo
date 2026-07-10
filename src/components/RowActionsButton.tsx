import { forwardRef } from 'react';

import { ActionIcon, type ActionIconProps } from '@mantine/core';
import { IconDotsVertical } from '@tabler/icons-react';

type RowActionsButtonProps = Omit<ActionIconProps, 'children'>;

/**
 * 一覧行の操作メニューを開くための共通ボタン。
 * 三点アイコン・控えめな見た目・アクセシブルなラベルを揃える。
 */
export const RowActionsButton = forwardRef<HTMLButtonElement, RowActionsButtonProps>(
  function RowActionsButton(props, ref) {
    return (
      <ActionIcon ref={ref} variant="subtle" color="gray" aria-label="行の操作" {...props}>
        <IconDotsVertical size={16} />
      </ActionIcon>
    );
  },
);

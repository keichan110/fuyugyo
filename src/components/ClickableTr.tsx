import { Table, type TableTrProps } from '@mantine/core';

import classes from './ClickableTr.module.css';

/**
 * クリックで編集導線を開く一覧テーブルの行。
 * Table.Tr の薄いラッパーで、カーソルを pointer にするスタイルを内蔵する。
 */
export function ClickableTr({
  className,
  inactive = false,
  ...props
}: TableTrProps & { inactive?: boolean }) {
  const rowClassName = [classes.row, inactive && classes.inactive, className]
    .filter(Boolean)
    .join(' ');
  return <Table.Tr className={rowClassName} {...props} />;
}

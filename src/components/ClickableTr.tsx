import { Table, type TableTrProps } from '@mantine/core';

import classes from './ClickableTr.module.css';

/**
 * クリックで編集導線を開く一覧テーブルの行。
 * Table.Tr の薄いラッパーで、カーソルを pointer にするスタイルを内蔵する。
 */
export function ClickableTr({ className, ...props }: TableTrProps) {
  const rowClassName = className ? `${classes.row} ${className}` : classes.row;
  return <Table.Tr className={rowClassName} {...props} />;
}

import { Table, type TableProps } from '@mantine/core';

type AppTableProps = TableProps & {
  /** 横スクロールを開始する最小幅 */
  minWidth: number;
};

/**
 * 管理系一覧で使う共通テーブル。
 * 枠線・行区切り・ホバー強調・行間をアプリ標準として固定する。
 */
export function AppTable({ minWidth, children, ...props }: AppTableProps) {
  return (
    <Table.ScrollContainer minWidth={minWidth}>
      <Table highlightOnHover withTableBorder withRowBorders verticalSpacing="sm" {...props}>
        {children}
      </Table>
    </Table.ScrollContainer>
  );
}

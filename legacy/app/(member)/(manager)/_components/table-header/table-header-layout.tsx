import type { ReactNode } from "react";

/**
 * テーブルヘッダーレイアウトコンポーネントのプロパティ
 */
export type TableHeaderLayoutProps = {
  /** タイトル行の内容 */
  titleRow: ReactNode;
  /** フィルター行の内容（オプション） */
  filterRow?: ReactNode;
  /** 追加のクラス名 */
  className?: string;
};

/**
 * テーブルヘッダーの共通レイアウトコンポーネント
 *
 * @description
 * 管理画面のテーブルヘッダーで使用される統一レイアウトコンポーネントです。
 * タイトル行（TableTitleRow）とフィルター行（TableFilterRow）を組み合わせて使用します。
 * instructorsページのレイアウトを基準とした統一デザインを提供します。
 *
 * レイアウト仕様:
 * - space-y-4: 2行構造の縦間隔
 * - border-b: 下部の区切り線
 * - p-4: 内側の余白
 *
 * @component
 * @example
 * ```tsx
 * <TableHeaderLayout
 *   titleRow={
 *     <TableTitleRow
 *       title="インストラクター一覧"
 *       rightAction={<Button>追加</Button>}
 *     />
 *   }
 *   filterRow={
 *     <TableFilterRow
 *       leftFilter={<Tabs>...</Tabs>}
 *       rightFilter={<Switch>...</Switch>}
 *     />
 *   }
 * />
 * ```
 */
export function TableHeaderLayout({
  titleRow,
  filterRow,
  className = "",
}: TableHeaderLayoutProps) {
  return (
    <div className={`space-y-4 border-b p-4 ${className}`}>
      {titleRow}
      {filterRow}
    </div>
  );
}

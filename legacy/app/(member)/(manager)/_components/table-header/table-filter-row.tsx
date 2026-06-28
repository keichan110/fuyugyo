import type { ReactNode } from "react";

/**
 * フィルター行コンポーネントのプロパティ
 */
export type TableFilterRowProps = {
  /** 左側に配置するフィルター（Tabs等） */
  leftFilter?: ReactNode;
  /** 右側に配置するフィルター（Switch等） */
  rightFilter?: ReactNode;
  /** 追加のクラス名 */
  className?: string;
};

/**
 * テーブルヘッダーのフィルター行コンポーネント
 *
 * @description
 * テーブルデータをフィルタリングするためのUI要素を配置するコンポーネントです。
 * 左側にカテゴリフィルター（Tabs等）、右側にトグルフィルター（Switch等）を配置します。
 * レスポンシブデザインに対応しており、モバイルでは縦並び、タブレット以上では横並びになります。
 * 両方のフィルターが未指定の場合は何も表示しません。
 *
 * @component
 * @example
 * ```tsx
 * // タブとスイッチを組み合わせた使用例
 * <TableFilterRow
 *   leftFilter={
 *     <Tabs value={category} onValueChange={setCategory}>
 *       <TabsList>
 *         <TabsTrigger value="all">すべて</TabsTrigger>
 *         <TabsTrigger value="ski">スキー</TabsTrigger>
 *       </TabsList>
 *     </Tabs>
 *   }
 *   rightFilter={
 *     <div className="flex items-center space-x-2">
 *       <Switch id="active" checked={showActive} onCheckedChange={setShowActive} />
 *       <Label htmlFor="active">有効のみ</Label>
 *     </div>
 *   }
 * />
 * ```
 */
export function TableFilterRow({
  leftFilter,
  rightFilter,
  className = "",
}: TableFilterRowProps) {
  // 両方とも存在しない場合は何も表示しない
  if (!(leftFilter || rightFilter)) {
    return null;
  }

  return (
    <div
      className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      {leftFilter ? <div className="flex-1">{leftFilter}</div> : <div />}
      {rightFilter}
    </div>
  );
}

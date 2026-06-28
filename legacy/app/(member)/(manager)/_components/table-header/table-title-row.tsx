import type { ReactNode } from "react";

/**
 * タイトル行コンポーネントのプロパティ
 */
export type TableTitleRowProps = {
  /** テーブルのタイトル */
  title: string;
  /** 右側に配置するボタン等（オプション） */
  rightAction?: ReactNode;
  /** 追加のクラス名 */
  className?: string;
};

/**
 * テーブルヘッダーのタイトル行コンポーネント
 *
 * @description
 * テーブルのタイトルと右側のアクション要素（追加ボタン等）を配置するコンポーネントです。
 * 左側にページタイトル、右側にアクションボタンを配置する水平レイアウトを提供します。
 * justify-between により、左右に要素を均等配置します。
 *
 * @component
 * @example
 * ```tsx
 * // 追加ボタン付きタイトル行
 * <TableTitleRow
 *   title="インストラクター一覧"
 *   rightAction={
 *     <Button onClick={handleAdd}>
 *       <Plus className="h-4 w-4" />
 *       追加
 *     </Button>
 *   }
 * />
 *
 * // タイトルのみ（アクションなし）
 * <TableTitleRow title="シフトタイプ一覧" />
 * ```
 */
export function TableTitleRow({
  title,
  rightAction,
  className = "",
}: TableTitleRowProps) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <h2 className="font-semibold text-lg">{title}</h2>
      {rightAction}
    </div>
  );
}

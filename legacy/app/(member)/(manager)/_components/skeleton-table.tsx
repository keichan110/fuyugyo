"use client";

import { type HTMLAttributes, useMemo } from "react";

import { cn } from "@/lib/utils";

export interface SkeletonTableProps extends HTMLAttributes<HTMLDivElement> {
  columns?: number;
  rows?: number;
  showHeader?: boolean;
}

/**
 * テーブルローディング用スケルトンコンポーネント
 *
 * @description
 * データ取得中のテーブル表示をシミュレートするスケルトンスクリーンです。
 * リスト表示の多い管理画面でレイアウトの安定性を保ちながら、
 * データ取得中であることを視覚的にユーザーに伝えます。
 *
 * 主な機能:
 * - カスタマイズ可能な列数・行数
 * - ヘッダー表示の切り替え
 * - パルスアニメーション（animate-pulse）
 * - レスポンシブ対応（モバイル: 縦並び、デスクトップ: 横並び）
 * - 一意なキー生成（crypto.randomUUID使用）
 *
 * @component
 * @example
 * ```tsx
 * // 5列×5行のテーブルスケルトン
 * <SkeletonTable columns={5} rows={5} showHeader={true} />
 *
 * // ヘッダーなしの3列×10行
 * <SkeletonTable columns={3} rows={10} showHeader={false} />
 * ```
 */
export function SkeletonTable({
  columns = 5,
  rows = 5,
  showHeader = true,
  className,
  ...rest
}: SkeletonTableProps) {
  const columnCount = Math.max(1, columns);
  const rowCount = Math.max(1, rows);

  const headerColumns = useMemo(
    () => Array.from({ length: columnCount }, () => crypto.randomUUID()),
    [columnCount]
  );

  const tableRows = useMemo(
    () =>
      Array.from({ length: rowCount }, () => ({
        id: crypto.randomUUID(),
        columns: Array.from({ length: columnCount }, () => crypto.randomUUID()),
      })),
    [rowCount, columnCount]
  );

  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse overflow-hidden rounded-xl border border-border/40 bg-card/60 shadow-sm",
        className
      )}
      {...rest}
    >
      {showHeader ? (
        <div className="hidden border-border/40 border-b bg-muted/20 px-6 py-3 sm:block">
          <div className="flex items-center gap-4">
            {headerColumns.map((id) => (
              <div className="h-4 flex-1 rounded-md bg-muted/60" key={id} />
            ))}
          </div>
        </div>
      ) : null}
      <div className="divide-y divide-border/40">
        {tableRows.map((row) => (
          <div
            className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6"
            key={row.id}
          >
            {row.columns.map((colId, colIndex) => (
              <div
                className={cn(
                  "h-4 rounded-md bg-muted/50",
                  colIndex === row.columns.length - 1
                    ? "w-1/3 sm:w-1/4"
                    : "w-full",
                  "sm:flex-1"
                )}
                key={colId}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

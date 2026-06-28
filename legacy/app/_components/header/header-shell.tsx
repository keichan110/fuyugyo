"use client";

import type { ReactNode } from "react";
import { HeaderProgressIndicator } from "./header-progress-indicator";
import { Logo } from "./logo";

/**
 * Header共通シェルコンポーネント
 *
 * 全てのHeaderで共通するレイアウト構造とロゴを提供。
 * Slot-based architectureにより、権限レベルに応じた機能追加が可能。
 */
type HeaderShellProps = {
  /** 左側スロット（管理メニューボタンなど） */
  leftSlot?: ReactNode;
  /** 右側スロット（ユーザードロップダウンなど） */
  rightSlot?: ReactNode;
};

export function HeaderShell({ leftSlot, rightSlot }: HeaderShellProps) {
  return (
    <header className="-translate-x-1/2 fixed top-4 left-1/2 z-50 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-2xl border border-border/20 bg-background/80 shadow-lg backdrop-blur-md">
        <HeaderProgressIndicator />
        <div className="relative z-10 px-6 py-3">
          <div className="flex items-center justify-between">
            {/* 左側: オプションのメニューボタン + ロゴ */}
            <div className="flex items-center gap-4">
              {leftSlot}
              <Logo />
            </div>

            {/* 右側: オプションのユーザーメニュー等 */}
            {rightSlot && (
              <div className="flex items-center gap-2">{rightSlot}</div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

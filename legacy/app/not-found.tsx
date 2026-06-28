"use client";

import { Home } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * グローバル404ページ
 * Next.jsの標準的なnot-found.tsxファイル
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* 404アイコンとメッセージ */}
        <div className="mb-8">
          <div className="mb-4 font-bold text-8xl text-primary">404</div>
          <h1 className="mb-3 font-semibold text-2xl text-foreground">
            ページが見つかりません
          </h1>
          <p className="text-muted-foreground">
            お探しのページは存在しないか、移動した可能性があります。
          </p>
        </div>

        {/* ナビゲーションボタン */}
        <div className="space-y-3">
          <Button asChild className="w-full" size="lg" variant="outline">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              ホームに戻る
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

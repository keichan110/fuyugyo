"use client";

import { ArrowLeft, Warning } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * エラーUI - 1日単位のシフト管理ページ
 *
 * @description
 * ページでエラーが発生した際に表示されるエラーUI。
 * リトライ機能とシフト一覧への戻りリンクを提供します。
 */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // エラーをコンソールに出力（開発時のデバッグ用）
    // biome-ignore lint/suspicious/noConsole: エラー情報をデバッグ目的で出力
    console.error("Shift page error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <Link
            className="inline-flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground"
            href="/shifts"
          >
            <ArrowLeft className="h-4 w-4" />
            シフト一覧に戻る
          </Link>
        </div>
      </div>

      {/* エラーメッセージ */}
      <div className="container mx-auto px-4 py-6">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <Warning className="h-6 w-6" />
              エラーが発生しました
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              シフト情報の読み込み中にエラーが発生しました。
              <br />
              時間をおいて再度お試しください。
            </p>

            {error.digest && (
              <div className="rounded-md bg-muted p-3">
                <p className="font-mono text-muted-foreground text-xs">
                  エラーID: {error.digest}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={reset} variant="default">
                再試行
              </Button>
              <Button asChild variant="outline">
                <Link href="/shifts">シフト一覧に戻る</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

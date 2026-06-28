"use client";

import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useShiftsLink } from "@/lib/hooks/use-shifts-link";

type DashboardErrorProps = {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
};

/**
 * ダッシュボードページのエラー状態
 *
 * エラーバウンダリによる自動的なエラー表示
 */
export default function DashboardError({ error, reset }: DashboardErrorProps) {
  const shiftsLink = useShiftsLink();

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-xl border border-destructive/30 bg-background/90 shadow-xl backdrop-blur-sm">
        <CardHeader className="space-y-4 text-center sm:text-left">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive sm:mx-0">
            <AlertTriangle aria-hidden="true" className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="font-semibold text-lg sm:text-xl">
              ダッシュボードを読み込めませんでした
            </CardTitle>
            <p className="mt-1 text-muted-foreground text-sm">
              予期しないエラーが発生しました。再試行するか、時間をおいてから再度アクセスしてください。
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-muted bg-muted/40 p-3 text-muted-foreground text-sm">
            <p className="font-medium text-foreground">技術情報</p>
            <p className="mt-1 break-all">
              {error.message || "不明なエラーが発生しました。"}
              {error.digest ? ` (digest: ${error.digest})` : ""}
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button asChild className="w-full sm:w-auto" variant="outline">
            <Link href={shiftsLink}>
              <Home aria-hidden="true" className="mr-2 h-4 w-4" />
              シフト表示へ
            </Link>
          </Button>
          <Button className="w-full sm:w-auto" onClick={reset}>
            <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />
            再試行する
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

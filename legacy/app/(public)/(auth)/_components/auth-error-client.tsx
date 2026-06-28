"use client";

import { AlertTriangle, Home, RefreshCw, Shield, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AuthErrorInfo } from "../_lib/auth-error-map";

/**
 * アイコン名からLucideアイコンコンポーネントへのマッピング
 */
const iconMap: Record<
  AuthErrorInfo["iconName"],
  { component: typeof AlertTriangle; colorClass: string }
> = {
  "alert-triangle": { component: AlertTriangle, colorClass: "text-red-500" },
  "x-circle": { component: XCircle, colorClass: "text-orange-500" },
  shield: { component: Shield, colorClass: "text-red-500" },
};

/**
 * エラー情報からアイコンコンポーネントを生成
 */
function getIcon(iconName: AuthErrorInfo["iconName"]): ReactNode {
  const { component: Icon, colorClass } = iconMap[iconName];
  return <Icon className={`h-8 w-8 ${colorClass}`} />;
}

/**
 * 認証エラー表示クライアントコンポーネント
 *
 * Props:
 * - エラー情報（title, message, iconName, canRetry, severity）
 * - description: 追加の説明文（サニタイズ済み）
 * - error: エラーコード（表示用）
 */
export type AuthErrorClientProps = AuthErrorInfo & {
  description?: string;
  error?: string;
};

export function AuthErrorClient({
  title,
  message,
  iconName,
  canRetry,
  severity,
  description,
  error,
}: AuthErrorClientProps) {
  const router = useRouter();

  /**
   * ログインページに戻る
   */
  const handleRetryLogin = () => {
    router.push("/login");
  };

  /**
   * ホームページに戻る
   */
  const handleGoHome = () => {
    router.push("/");
  };

  /**
   * ページを再読み込み
   */
  const handleRefresh = () => {
    window.location.reload();
  };

  const icon = getIcon(iconName);

  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* エラー表示カード */}
        <Card className="border-0 bg-card/50 shadow-lg backdrop-blur-sm">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-background/80">
              {icon}
            </div>
            <div className="space-y-2">
              <CardTitle className="font-bold text-foreground text-xl">
                {title}
              </CardTitle>
              <CardDescription className="text-center">
                Fuyugyō - 運営管理システム
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* エラーメッセージ */}
            <Alert variant={severity === "error" ? "destructive" : "default"}>
              <AlertDescription className="text-sm">
                {message}
                {description && (
                  <>
                    <br />
                    <br />
                    <span className="text-muted-foreground text-xs">
                      詳細: {description}
                    </span>
                  </>
                )}
              </AlertDescription>
            </Alert>

            {/* アクションボタン */}
            <div className="space-y-3">
              {canRetry && (
                <>
                  <Button
                    className="w-full bg-[#06C755] text-white hover:bg-[#05B84C]"
                    onClick={handleRetryLogin}
                    size="lg"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    再度ログインする
                  </Button>
                  <Button
                    className="w-full"
                    onClick={handleRefresh}
                    size="lg"
                    variant="outline"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    ページを再読み込み
                  </Button>
                </>
              )}
              <Button
                className="w-full"
                onClick={handleGoHome}
                size="lg"
                variant="ghost"
              >
                <Home className="mr-2 h-4 w-4" />
                ホームに戻る
              </Button>
            </div>

            {/* 追加情報 */}
            <div className="space-y-2 text-center text-muted-foreground text-xs">
              <p>
                問題が継続する場合は、
                <br />
                管理者にお問い合わせください。
              </p>
              {error && error !== "unknown" && <p>エラーコード: {error}</p>}
            </div>
          </CardContent>
        </Card>

        {/* システム情報 */}
        <Card className="border-0 bg-card/30 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="space-y-2 text-center text-muted-foreground text-xs">
              <p>
                このシステムはLINEアカウントでの認証が必要です。
                <br />
                LINE アプリがインストールされていることをご確認ください。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

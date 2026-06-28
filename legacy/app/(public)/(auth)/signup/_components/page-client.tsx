"use client";

import { Loader2, Shield, Users } from "lucide-react";
import { useState } from "react";
import { LineLoginButton } from "@/app/(public)/login/_components/line-login-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * SignupPageClient Props
 */
export type SignupPageClientProps = {
  /** LINE ログイン URL（サーバーで生成済み） */
  lineLoginUrl: string;
  /** 招待トークンが存在するか */
  hasInvite: boolean;
};

/**
 * サインアップページクライアントコンポーネント
 * LINE 認証による新規登録 UI を提供
 *
 * Props:
 * - lineLoginUrl: サーバーで生成された LINE ログイン URL
 * - hasInvite: 招待トークンの有無（UI 表示切り替え用）
 */
export function SignupPageClient({
  lineLoginUrl,
  hasInvite,
}: SignupPageClientProps) {
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * LINE認証による新規登録開始
   */
  const handleLineSignup = () => {
    try {
      setIsSigningUp(true);
      setError(null);

      // サーバーから受け取った URL にリダイレクト
      window.location.href = lineLoginUrl;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "新規登録に失敗しました";
      setError(errorMessage);
      setIsSigningUp(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* メインログインカード */}
        <Card className="border-0 bg-card/50 shadow-lg backdrop-blur-sm">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-2">
              <CardTitle className="font-bold text-2xl">新規登録</CardTitle>
              <CardDescription className="text-center">
                {hasInvite ? (
                  <>
                    <span className="font-medium text-lg text-primary">
                      ようこそ!
                    </span>
                    <br />
                    Fuyugyō - 運営管理システムへ招待されています
                  </>
                ) : (
                  "Fuyugyō - 運営管理システム"
                )}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 招待情報表示 */}
            {hasInvite && (
              <Alert className="border-primary/20 bg-primary/5">
                <Users className="h-4 w-4" />
                <AlertDescription>
                  <strong>招待を受け取りました</strong>
                  <br />
                  LINEアカウントで新規登録してシステムをご利用いただけます。
                </AlertDescription>
              </Alert>
            )}

            {/* エラー表示 */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* LINE新規登録ボタン */}
            {isSigningUp ? (
              <Button
                className="w-full bg-[#06C755] text-white disabled:opacity-50"
                disabled
                size="lg"
              >
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                登録中...
              </Button>
            ) : (
              <LineLoginButton
                className="w-full"
                onClick={handleLineSignup}
                size="lg"
                text="Sign up"
              />
            )}

            {/* 説明テキスト */}
            <div className="space-y-2 text-center text-muted-foreground text-sm">
              <p>
                {hasInvite
                  ? "招待コードの入力は不要です。LINEアカウントで新規登録してご利用いただけます。"
                  : "LINEアカウントで新規登録することで、シフト管理機能をご利用いただけます。"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 注意事項 */}
        <div className="text-center text-muted-foreground text-xs">
          <p>
            新規登録することで、
            <br />
            <a
              className="text-primary hover:underline"
              href="/terms"
              rel="noopener noreferrer"
              target="_blank"
            >
              利用規約
            </a>
            と
            <a
              className="text-primary hover:underline"
              href="/privacy"
              rel="noopener noreferrer"
              target="_blank"
            >
              プライバシーポリシー
            </a>
            に同意したものとみなします。
          </p>
        </div>
      </div>
    </div>
  );
}

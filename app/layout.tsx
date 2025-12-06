import type { Metadata } from "next";
import "./globals.css";
import Background from "@/app/_components/background";
import Footer from "@/app/_components/footer";
import { NotificationProvider } from "@/app/_providers/notifications";
import { QueryProvider } from "@/app/_providers/query-client";
import { ThemeProvider } from "@/app/_providers/theme-provider";

export const metadata: Metadata = {
  title: "Fuyugyō - 運営管理システム",
  description:
    "スキー・スノーボードスクールの運営管理を効率化するWebアプリケーション",
};

/**
 * ルートレイアウト
 *
 * グローバルプロバイダーと共通UIコンポーネントを提供する設計。
 *
 * - Background: 背景デザイン
 * - Footer: 全ページで表示
 * - 各ルートグループが独自のHeaderと認証状態を提供：
 *   - (public): HeaderPublic（ロゴのみ） - 認証不要
 *   - (member): HeaderAuthenticated（権限に応じた機能） + AuthProvider（サーバー取得済みユーザー情報付き）
 *
 * パフォーマンス最適化：
 * - 公開ページは静的配信可能（認証チェックなし、AuthProviderなし）
 * - メンバーページはlayout.tsxで認証チェック後、AuthProviderと最適化されたHeaderを提供
 * - 不要なAPI呼び出しを排除し、必要な場所でのみ認証状態を管理
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            storageKey="snow-school-theme"
            value={{
              light: "light",
              dark: "dark",
              system: "system",
            }}
          >
            <NotificationProvider>
              <Background />
              <div className="flex min-h-screen flex-col">
                <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-32 sm:px-6 lg:px-8">
                  {children}
                </main>
                <Footer />
              </div>
            </NotificationProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

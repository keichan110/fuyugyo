import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ログイン - Fuyugyō",
  description: "LINE認証でログインして、運営管理システムをご利用ください。",
};

/**
 * 認証ページ用レイアウト
 * ログイン・エラーページなどの認証関連ページで使用
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      {/* 背景グラデーション */}
      <div className="-z-10 fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
        <div className="-right-40 -top-40 absolute h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="-bottom-40 -left-40 absolute h-80 w-80 rounded-full bg-secondary/10 blur-3xl" />
      </div>

      {/* コンテンツ */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

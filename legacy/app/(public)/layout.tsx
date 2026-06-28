import type { ReactNode } from "react";
import { HeaderPublic } from "@/app/_components/header";

/**
 * 公開ページレイアウト
 *
 * このレイアウトの役割：
 * 1. 認証不要のページグループ（login, logout, terms, privacy等）に適用
 * 2. ガード処理を行わず、誰でもアクセス可能
 * 3. HeaderPublicを提供（ロゴのみのシンプルなHeader）
 *
 * 設計上の重要な点：
 * - AuthProvider、Background、Footerは RootLayout で提供される
 * - HeaderPublicは このレイアウト で提供される
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <HeaderPublic />
      {children}
    </>
  );
}

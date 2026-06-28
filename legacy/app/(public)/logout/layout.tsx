import type { ReactNode } from "react";

import { AuthProvider } from "@/app/_providers/auth";

/**
 * ログアウトページ専用レイアウト
 *
 * このレイアウトの役割：
 * - ログアウトページでuseAuth()を使用可能にするためのAuthProviderを提供
 * - initialUserなしで起動（ログアウト処理のみに使用）
 *
 * 設計上の理由：
 * - ルートレイアウトからAuthProviderを削除したため、公開ページでは基本的に認証状態を管理しない
 * - ログアウトページは例外的にuseAuth().logout()を使用する必要があるため、個別にProviderを追加
 * - AuthProviderがないと、LogoutPageClientでuseAuth()を呼び出した際にエラーが発生する
 */
type Props = {
  children: ReactNode;
};

export default function LogoutLayout({ children }: Props) {
  return <AuthProvider>{children}</AuthProvider>;
}

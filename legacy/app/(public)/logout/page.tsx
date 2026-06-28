import LogoutPageClient from "./_components/page-client";

export const dynamic = "force-dynamic";

/**
 * ログアウトページ
 *
 * このページの役割：
 * 1. サーバーサイドでセッション破棄処理を実行
 * 2. ログアウト完了後にルートページへリダイレクト
 * 3. ユーザーには「ログアウト中...」のUIを表示
 *
 * サーバーコンポーネントとして実装：
 * - Server Actionによる確実なセッション破棄
 * - クライアントコンポーネントで非同期処理とUI表示
 * - `dynamic = "force-dynamic"` で常に最新状態を反映
 *
 * フロー：
 * 1. ページにアクセス
 * 2. クライアントコンポーネントがマウントされ、Server Actionを呼び出し
 * 3. Server ActionがCookieを削除し、`/` へリダイレクト
 * 4. ルートページが未認証を検知し、`/login` へリダイレクト
 */
export default function LogoutPage() {
  return <LogoutPageClient />;
}

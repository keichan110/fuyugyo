import { redirect } from "next/navigation";
import { authenticateFromCookies } from "@/lib/auth/middleware";
import LoginPageClient from "./_components/page-client";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * リダイレクト先URLを安全に検証
 * Open Redirect 攻撃を防ぐため、相対パスまたはアプリ内パスのみ許可
 *
 * @param redirectParam - URL パラメータから取得したリダイレクト先
 * @returns 検証済みの安全なリダイレクト先URL
 */
function validateRedirectUrl(
  redirectParam: string | string[] | undefined
): string {
  // パラメータが配列の場合は最初の要素を使用
  const redirectValue = Array.isArray(redirectParam)
    ? redirectParam[0]
    : redirectParam;

  // パラメータが空、または undefined の場合はデフォルト
  if (!redirectValue) {
    return "/";
  }

  try {
    // プロトコル付き、またはプロトコル相対URLは拒否
    if (redirectValue.includes("://") || redirectValue.startsWith("//")) {
      return "/";
    }

    // 相対パスの場合は許可（/ で始まる）
    if (redirectValue.startsWith("/")) {
      return redirectValue;
    }

    // それ以外はデフォルト
    return "/";
  } catch {
    // パース失敗時はデフォルト
    return "/";
  }
}

/**
 * ログインページ
 *
 * このページの目的：
 * 1. 保護されたページからのリダイレクト先として機能
 * 2. ログイン完了後に元のページに戻る
 * 3. シンプルで明確なログインフロー提供
 *
 * サーバーコンポーネントとして実装：
 * - 認証済みユーザーはサーバー側で即座にリダイレクト
 * - 未認証ユーザーにはログイン UI を表示
 * - `redirect` クエリパラメータによる遷移先制御（Open Redirect 対策済み）
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  // サーバー側で認証状態をチェック
  const authResult = await authenticateFromCookies();

  // クエリパラメータを取得
  const params = await searchParams;
  const redirectUrl = validateRedirectUrl(params.redirect);
  const inviteToken = Array.isArray(params.invite)
    ? params.invite[0]
    : params.invite;

  // 既にログイン済みの場合はリダイレクト
  if (authResult.success && authResult.user) {
    redirect(redirectUrl);
  }

  // 未認証の場合はログイン UI を表示
  return (
    <LoginPageClient inviteToken={inviteToken} redirectUrl={redirectUrl} />
  );
}

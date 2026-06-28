import { redirect } from "next/navigation";
import { authenticateFromCookies } from "@/lib/auth/middleware";
import { SignupPageClient } from "./_components/page-client";
import { resolveInviteToken } from "./_lib/resolve-invite-token";

export const dynamic = "force-dynamic";

type SignupPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * サインアップページ
 *
 * このページの目的：
 * 1. 招待URL経由での新規ユーザー登録
 * 2. LINE認証による安全な認証フロー
 * 3. 招待トークンの検証とエラーハンドリング
 *
 * サーバーコンポーネントとして実装：
 * - 認証済みユーザーはサーバー側で即座にリダイレクト
 * - 招待トークンをサーバー側で検証
 * - 無効なトークンは適切なエラーページへ誘導
 * - 未認証ユーザーには登録UIを表示
 */
export default async function SignupPage({ searchParams }: SignupPageProps) {
  // サーバー側で認証状態をチェック
  const authResult = await authenticateFromCookies();

  // 既にログイン済みの場合はリダイレクト
  if (authResult.success && authResult.user) {
    redirect("/");
  }

  // クエリパラメータを取得
  const params = await searchParams;

  // 招待トークンを解析・検証
  const inviteResult = await resolveInviteToken(params.invite);

  // 招待トークンが提供されているが無効な場合はエラーページへ
  if (inviteResult.hasInvite && !inviteResult.inviteToken) {
    // エラー種別に応じてエラーコードを設定
    let errorCode = "invitation_required";
    if (inviteResult.errorType === "expired") {
      errorCode = "invitation_expired";
    } else if (inviteResult.errorType === "inactive") {
      errorCode = "invitation_inactive";
    }

    redirect(`/error?error=${errorCode}`);
  }

  // LINE ログイン URL を生成
  const lineLoginUrl = inviteResult.inviteToken
    ? `/api/auth/line/login?invite=${encodeURIComponent(inviteResult.inviteToken)}`
    : "/api/auth/line/login";

  // 未認証の場合はサインアップ UI を表示
  return (
    <SignupPageClient
      hasInvite={inviteResult.hasInvite}
      lineLoginUrl={lineLoginUrl}
    />
  );
}

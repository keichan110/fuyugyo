import { AuthErrorClient } from "../_components/auth-error-client";
import { authErrorMap, sanitizeDescription } from "../_lib/auth-error-map";

type AuthErrorPageProps = {
  searchParams: Promise<{
    error?: string;
    description?: string | string[];
    reason?: string;
  }>;
};

/**
 * 認証エラーページ（Server Component）
 *
 * LINE認証エラー、権限エラー、セッションエラーなどを表示
 * サーバー側でクエリパラメータを解析し、エラー情報をクライアントに渡す
 */
export default async function AuthErrorPage({
  searchParams,
}: AuthErrorPageProps) {
  const params = await searchParams;
  const error = params.error || params.reason || "unknown";
  const rawDescription = params.description;
  const normalizedDescription = Array.isArray(rawDescription)
    ? rawDescription[0] || ""
    : rawDescription || "";
  const description = sanitizeDescription(normalizedDescription);

  const errorInfo = authErrorMap(error);

  return (
    <AuthErrorClient {...errorInfo} description={description} error={error} />
  );
}

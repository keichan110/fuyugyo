import { headers } from "next/headers";

/**
 * 権限不足時のリダイレクト先
 * 将来的に変更可能な定数として定義
 */
export const ACCESS_DENIED_REDIRECT = "/";

/**
 * 現在のパスを取得
 * Next.js App Router の Server Components から現在のパスを取得する
 *
 * ヘッダー確認の優先順位（環境によって異なるヘッダーが利用可能）：
 * 1. `next-url` - Next.js 15 dev/Node runtime で主に使用される
 * 2. `x-url` - カスタムプロキシやミドルウェアが設定する場合がある
 * 3. `x-forwarded-url` - リバースプロキシ（nginx等）が設定する場合がある
 * 4. `x-forwarded-proto` + `x-forwarded-host` + `x-original-uri` - 個別ヘッダーから構築
 * 5. `x-original-uri` または `/` - 最終フォールバック
 *
 * @returns 現在のパス（pathname + search）
 *
 * @example
 * ```typescript
 * const currentPath = await resolveCurrentPath();
 * // "/users?page=2"
 * ```
 */
export async function resolveCurrentPath(): Promise<string> {
  const headersList = await headers();

  // 1. Next.js 15 の next-url ヘッダーを最優先で確認（開発環境で主に使用される）
  const nextUrl = headersList.get("next-url");
  if (nextUrl) {
    try {
      const parsed = new URL(nextUrl);
      return parsed.pathname + parsed.search;
    } catch {
      // URL パースに失敗した場合はフォールバック
    }
  }

  // 2. x-url または x-forwarded-url を確認
  const url = headersList.get("x-url") ?? headersList.get("x-forwarded-url");
  if (url) {
    try {
      const parsed = new URL(url);
      return parsed.pathname + parsed.search;
    } catch {
      // URL パースに失敗した場合はフォールバック
    }
  }

  // 3. x-forwarded-proto と x-forwarded-host から構築を試みる
  const proto = headersList.get("x-forwarded-proto");
  const host = headersList.get("x-forwarded-host");
  const path = headersList.get("x-original-uri") ?? "/";

  if (proto && host) {
    try {
      const constructed = new URL(path, `${proto}://${host}`);
      return constructed.pathname + constructed.search;
    } catch {
      // URL 構築に失敗した場合はフォールバック
    }
  }

  // フォールバック: パスのみ返却
  return path;
}

/**
 * ログインリダイレクトURL構築
 * 未認証ユーザーをログインページへリダイレクトする際のURLを生成
 *
 * @param returnTo - リダイレクト後の戻り先URL（省略時は現在のパス）
 * @returns ログインページURL（`/login?redirect=...`）
 *
 * @example
 * ```typescript
 * // 現在のパスを使用
 * const loginUrl = await buildLoginRedirectUrl();
 * // "/login?redirect=%2Fusers"
 *
 * // 明示的にパスを指定
 * const loginUrl = await buildLoginRedirectUrl("/dashboard");
 * // "/login?redirect=%2Fdashboard"
 * ```
 */
export async function buildLoginRedirectUrl(
  returnTo?: string
): Promise<string> {
  const targetPath = returnTo ?? (await resolveCurrentPath());
  const encoded = encodeURIComponent(targetPath);
  return `/login?redirect=${encoded}`;
}

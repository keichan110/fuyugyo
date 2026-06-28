"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * ログアウト Server Action
 *
 * このアクションの役割：
 * 1. サーバー側で認証Cookieを削除
 * 2. ルートページへリダイレクト（→ /login へ自動遷移）
 *
 * 使用方法：
 * - クライアントコンポーネントから `await logoutAction()` で呼び出し
 * - redirect() の呼び出しにより、呼び出し元でエラーがスローされる（Next.js の仕様）
 */
export async function logoutAction() {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";

  const deleteCookieSafely = (
    name: string,
    options: { path: string; sameSite: "lax" | "strict" }
  ) => {
    try {
      // cookies().delete() はオプションをサポートしていないため、
      // set() を使用して空の値と maxAge: 0 でCookieを削除する
      cookieStore.set({
        name,
        value: "",
        path: options.path,
        sameSite: options.sameSite,
        secure: isProduction,
        httpOnly: true,
        maxAge: 0,
      });
    } catch {
      // Cookie操作に失敗してもリダイレクト処理は継続する
    }
  };

  deleteCookieSafely("auth-token", { path: "/", sameSite: "lax" });
  deleteCookieSafely("auth-session", { path: "/", sameSite: "lax" });
  deleteCookieSafely("refresh-token", {
    path: "/api/auth",
    sameSite: "strict",
  });

  // ルートページにリダイレクト
  // ルートページは未認証ユーザーを /login へリダイレクトする
  redirect("/");
}

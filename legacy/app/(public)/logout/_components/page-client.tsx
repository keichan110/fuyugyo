"use client";

import { isRedirectError } from "next/dist/client/components/redirect-error";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth } from "@/app/_providers/auth";
import { logoutAction } from "@/lib/auth/actions";

/**
 * ログアウトアクション実行クライアントコンポーネント
 *
 * このコンポーネントの役割：
 * 1. クライアント状態をクリア (AuthProvider.logout)
 * 2. Server Action（logoutAction）でサーバー側Cookie削除
 * 3. ログアウト処理中のスピナーUIを表示
 * 4. Server Action内の redirect() により自動的にリダイレクト
 *
 * 注意：
 * - useEffectは空の依存配列でマウント時のみ1回実行される
 * - logout()でクライアント状態をクリアすることでUIが即座に更新される
 * - logout関数は再レンダリング毎に新しく生成されるが、依存配列に含めると重複実行されるため意図的に除外
 * - Server Action内で redirect() が呼ばれるとエラーとしてキャッチされる（Next.jsの仕様、正常な挙動）
 */
export default function LogoutPageClient() {
  const { logout } = useAuth();
  const router = useRouter();
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (hasTriggeredRef.current) {
      return;
    }
    hasTriggeredRef.current = true;

    const performLogout = async () => {
      try {
        // 1. まずクライアント状態をクリア (AuthProvider.logout呼び出し)
        // これにより、Header等のUIが即座に未認証状態に更新される
        await logout();

        // 2. 次にServer Actionでサーバー側Cookie削除+リダイレクト
        await logoutAction();

        // redirect が発生しない場合のフォールバック
        router.replace("/login");
      } catch (error) {
        if (isRedirectError(error)) {
          // redirectエラーは再送出してNext.jsに処理を委ねる
          throw error;
        }

        // redirectが発生しなかった場合でもUXを維持するためログインページへ遷移
        router.replace("/login");
      }
    };

    performLogout().catch((error) => {
      if (isRedirectError(error)) {
        throw error;
      }
    });
  }, [logout, router]);

  return (
    <div className="flex h-[calc(100vh-16rem)] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-blue-600 border-b-2" />
        <h2 className="mb-2 font-semibold text-gray-800 text-xl">
          ログアウト中...
        </h2>
        <p className="text-gray-600">少々お待ちください</p>
      </div>
    </div>
  );
}

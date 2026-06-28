import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import {
  ACCESS_DENIED_REDIRECT,
  buildLoginRedirectUrl,
} from "@/lib/auth/auth-redirect";
import { ensureRole } from "@/lib/auth/role-guard";

/**
 * ADMIN権限を持つユーザー専用レイアウト
 * - 未認証ユーザーは `/login?redirect=...` へリダイレクト
 * - MEMBER/MANAGER権限のユーザーは `/` へリダイレクト
 * - AuthProvider は親レイアウト（(member)/layout.tsx）で設定済みのため、ここでは再設定しない
 */
export const dynamic = "force-dynamic";

type Props = {
  children: ReactNode;
};

export default async function AdminLayout({ children }: Props) {
  const result = await ensureRole({ atLeast: "ADMIN" });

  if (result.status === "unauthenticated") {
    redirect(await buildLoginRedirectUrl());
  }

  if (result.status === "forbidden") {
    redirect(ACCESS_DENIED_REDIRECT);
  }

  // AuthProvider は親レイアウトで設定済み
  return <>{children}</>;
}

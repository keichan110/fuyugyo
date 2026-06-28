"use client";

import { HeaderShell } from "./header-shell";

/**
 * 公開ルート用Headerコンポーネント
 *
 * 未認証ユーザー向けにロゴのみを表示する最小構成。
 * Root Layoutで使用される。
 */
export function HeaderPublic() {
  return <HeaderShell />;
}

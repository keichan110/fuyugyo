"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

/**
 * アプリケーションロゴコンポーネント
 * 全てのHeaderで共通して使用されるロゴ表示
 */
export function Logo() {
  const router = useRouter();

  const handlePrefetch = useCallback(
    (href: string) => {
      if (!href) {
        return;
      }
      router.prefetch(href);
    },
    [router]
  );

  return (
    <Link
      className="flex items-center"
      href="/"
      onFocus={() => handlePrefetch("/")}
      onMouseEnter={() => handlePrefetch("/")}
      prefetch
    >
      <h1 className="font-bold text-foreground text-xl">Fuyugyō</h1>
    </Link>
  );
}

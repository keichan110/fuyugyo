import { SkeletonAppShell } from "@/app/_components/skeleton-app-shell";

/**
 * ダッシュボードページのローディング状態
 *
 * Suspenseによる自動的なローディング表示
 */
export default function Loading() {
  return <SkeletonAppShell />;
}

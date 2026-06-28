import type { HTMLAttributes } from "react";
import { SkeletonSection } from "@/app/(member)/shifts/_components/ui/section-skeleton";
import { cn } from "@/lib/utils";
import { SkeletonCardGrid } from "./skeleton-card-grid";

export type SkeletonAppShellProps = HTMLAttributes<HTMLDivElement>;

/**
 * SkeletonAppShell surfaces a lightweight, shared placeholder so users know a route change is in progress.
 */
export function SkeletonAppShell({
  className,
  ...rest
}: SkeletonAppShellProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 md:py-8 lg:px-8",
        className
      )}
      {...rest}
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <div className="h-7 w-48 rounded-md bg-muted" />
          <div className="h-4 w-72 rounded-md bg-muted/70" />
        </div>

        <SkeletonCardGrid items={3} />

        <div className="grid gap-6 md:grid-cols-2">
          <SkeletonSection bodyLines={4} showSubtitle />
          <SkeletonSection bodyLines={5} />
        </div>
      </div>
    </div>
  );
}

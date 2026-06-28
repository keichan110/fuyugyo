import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface SkeletonCardGridProps extends HTMLAttributes<HTMLDivElement> {
  items?: number;
}

/**
 * SkeletonCardGrid displays a responsive collection of card placeholders for dashboards or overview panels.
 */
export function SkeletonCardGrid({
  items = 4,
  className,
  ...rest
}: SkeletonCardGridProps) {
  const count = Math.max(1, items);
  const cardArray = Array.from({ length: count }, (_, i) => i);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-4",
        className
      )}
      {...rest}
    >
      {cardArray.map((cardId) => (
        <div
          className="flex flex-col justify-between rounded-xl border border-border/40 bg-card/60 p-5 shadow-sm"
          key={`skeleton-card-${cardId}`}
        >
          <div className="space-y-3">
            <div className="h-5 w-24 rounded-md bg-muted" />
            <div className="h-4 w-20 rounded-md bg-muted/70" />
          </div>
          <div className="mt-6 space-y-3">
            <div className="h-4 w-full rounded-md bg-muted/60" />
            <div className="h-4 w-5/6 rounded-md bg-muted/50" />
            <div className="h-4 w-2/3 rounded-md bg-muted/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface SkeletonSectionProps extends HTMLAttributes<HTMLDivElement> {
  bodyLines?: number;
  showSubtitle?: boolean;
}

/**
 * SkeletonSection renders a generic section placeholder so routes can surface UI immediately while data loads.
 */
export function SkeletonSection({
  bodyLines = 3,
  showSubtitle = false,
  className,
  ...rest
}: SkeletonSectionProps) {
  const lineCount = Math.max(1, bodyLines);
  const lineArray = Array.from({ length: lineCount }, (_, i) => i);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse space-y-4 rounded-xl border border-border/40 bg-card/60 p-6 shadow-sm",
        className
      )}
      {...rest}
    >
      <div className="h-6 w-40 rounded-md bg-muted" />
      {showSubtitle ? (
        <div className="h-4 w-3/5 rounded-md bg-muted/70" />
      ) : null}
      <div className="space-y-3">
        {lineArray.map((lineId) => (
          <div
            className={cn(
              "h-4 rounded-md bg-muted/60",
              lineId === lineArray.length - 1 ? "w-3/4" : "w-full"
            )}
            key={`skeleton-section-line-${lineId}`}
          />
        ))}
      </div>
    </div>
  );
}

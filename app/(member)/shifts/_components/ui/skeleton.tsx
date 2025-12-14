"use client";

import { type HTMLAttributes, useMemo } from "react";

import { cn } from "@/lib/utils";

export interface SkeletonCalendarProps extends HTMLAttributes<HTMLDivElement> {
  weeks?: number;
  daysPerWeek?: number;
  showWeekdayHeader?: boolean;
}

/**
 * SkeletonCalendar provides a calendar-shaped placeholder tailored for the public shifts grid.
 */
export function SkeletonCalendar({
  weeks = 5,
  daysPerWeek = 7,
  showWeekdayHeader = true,
  className,
  style,
  ...rest
}: SkeletonCalendarProps) {
  const totalWeeks = Math.max(1, weeks);
  const totalDays = Math.max(1, daysPerWeek);
  const cellCount = totalWeeks * totalDays;

  const headerItems = useMemo(
    () => Array.from({ length: totalDays }, () => crypto.randomUUID()),
    [totalDays]
  );

  const cellItems = useMemo(
    () => Array.from({ length: cellCount }, () => crypto.randomUUID()),
    [cellCount]
  );

  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse space-y-4 rounded-xl border border-border/40 bg-card/60 p-4 shadow-sm sm:p-6",
        className
      )}
      style={style}
      {...rest}
    >
      {showWeekdayHeader ? (
        <div
          className="grid gap-2 font-medium text-muted-foreground/70 text-xs uppercase tracking-wide"
          style={{
            gridTemplateColumns: `repeat(${totalDays}, minmax(0, 1fr))`,
          }}
        >
          {headerItems.map((id) => (
            <div className="h-3 rounded-md bg-muted/50" key={id} />
          ))}
        </div>
      ) : null}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${totalDays}, minmax(0, 1fr))` }}
      >
        {cellItems.map((id) => (
          <div
            className="rounded-lg border border-border/40 bg-muted/40 p-3 shadow-sm"
            key={id}
          >
            <div className="h-4 w-8 rounded-md bg-muted" />
            <div className="mt-4 space-y-2">
              <div className="h-3 w-full rounded-md bg-muted/70" />
              <div className="h-3 w-3/4 rounded-md bg-muted/60" />
              <div className="h-3 w-2/3 rounded-md bg-muted/50" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

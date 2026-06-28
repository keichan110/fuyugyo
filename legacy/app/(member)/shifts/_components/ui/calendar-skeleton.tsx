import { cn } from "@/lib/utils";

type ShiftCalendarSkeletonProps = {
  className?: string;
};

export function ShiftCalendarSkeleton({
  className,
}: ShiftCalendarSkeletonProps) {
  return (
    <div className={cn("hidden animate-pulse sm:block", className)}>
      {/* カレンダーグリッド */}
      <div className="grid grid-cols-7 gap-2 md:gap-2">
        {/* 35 日分のスケルトン (5週間) */}
        {Array.from({ length: 35 }).map((_, cellIndex) => {
          // biome-ignore lint/style/noMagicNumbers: ランダム表示のため
          const badgeCount = Math.floor(Math.random() * 4);
          return (
            <div
              className="min-h-[120px] rounded-xl border-2 border-border/20 bg-muted/50 p-3 shadow-lg md:min-h-[140px]"
              // biome-ignore lint/suspicious/noArrayIndexKey: スケルトン表示のため固定順序
              key={cellIndex}
            >
              <div className="flex flex-col space-y-2">
                {/* 日付のスケルトン */}
                <div className="h-6 w-8 rounded-md bg-muted" />

                {/* シフトバッジのスケルトン（ランダムに0-3個） */}
                {Array.from({ length: badgeCount }).map((__, badgeIdx) => (
                  <div
                    className="h-6 w-16 rounded-full bg-muted"
                    // biome-ignore lint/suspicious/noArrayIndexKey: スケルトン表示のため固定順序
                    key={`${cellIndex}-${badgeIdx}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

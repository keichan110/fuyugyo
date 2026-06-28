import { SkeletonSection } from "@/app/(member)/shifts/_components/ui/section-skeleton";
import { SkeletonCalendar } from "@/app/(member)/shifts/_components/ui/skeleton";

export default function ShiftsLoading() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 md:py-8 lg:px-8">
        <div aria-hidden="true" className="mb-6 text-center md:mb-8">
          <div className="mx-auto h-8 w-48 rounded-md bg-muted" />
          <div className="mx-auto mt-3 h-4 w-64 rounded-md bg-muted/70" />
        </div>

        <div aria-hidden="true" className="mb-6 flex justify-center">
          <div className="flex items-center gap-3">
            <div className="h-10 w-28 rounded-full bg-muted/60" />
            <div className="h-10 w-28 rounded-full bg-muted/40" />
          </div>
        </div>

        <div className="mb-8 space-y-6">
          <div
            aria-hidden="true"
            className="-mx-4 sticky top-20 z-40 border-border/30 border-b bg-background/80 px-4 py-4 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="h-9 w-9 rounded-full bg-muted/50" />
              <div className="h-6 w-40 rounded-md bg-muted/70" />
              <div className="h-9 w-9 rounded-full bg-muted/50" />
            </div>
          </div>

          <SkeletonCalendar className="hidden sm:block" />

          <div className="space-y-4 sm:hidden">
            <SkeletonSection bodyLines={4} />
            <SkeletonSection bodyLines={4} />
          </div>

          <SkeletonSection
            bodyLines={6}
            className="hidden sm:block"
            showSubtitle
          />
        </div>
      </div>
    </div>
  );
}

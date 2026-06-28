import { SkeletonTable } from "@/app/(member)/(manager)/_components/skeleton-table";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 md:py-8 lg:px-8">
      <div className="mb-6 space-y-3 md:mb-8">
        <div className="h-8 w-48 rounded-md bg-muted/70" />
        <div className="h-4 w-64 rounded-md bg-muted/50" />
      </div>

      <div className="mb-4 md:mb-6">
        <div className="flex items-center justify-center divide-x divide-border rounded-lg border border-border/40 bg-card/60 p-4 shadow-sm">
          <div className="flex items-center gap-2 px-4">
            <div className="h-6 w-6 rounded-full bg-muted/60" />
            <div className="h-5 w-10 rounded-md bg-muted/40" />
          </div>
          <div className="flex items-center gap-2 px-4">
            <div className="h-6 w-6 rounded-full bg-muted/60" />
            <div className="h-5 w-10 rounded-md bg-muted/40" />
          </div>
          <div className="hidden items-center gap-2 px-4 md:flex">
            <div className="h-6 w-6 rounded-full bg-muted/60" />
            <div className="h-5 w-10 rounded-md bg-muted/40" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white shadow-lg dark:bg-gray-900">
        <div className="space-y-4 border-b p-4">
          <div className="flex items-center justify-between">
            <div className="h-5 w-24 rounded-md bg-muted/60" />
            <div className="h-9 w-24 rounded-md bg-muted/50" />
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid w-full grid-cols-3 gap-2 sm:w-auto">
              <div className="h-9 rounded-md bg-muted/40" />
              <div className="h-9 rounded-md bg-muted/30" />
              <div className="h-9 rounded-md bg-muted/20" />
            </div>
            <div className="hidden h-9 w-32 rounded-md bg-muted/30 sm:block" />
          </div>
        </div>
        <div className="p-4">
          <SkeletonTable
            className="border-none bg-transparent p-0 shadow-none"
            columns={4}
            rows={6}
          />
        </div>
      </div>
    </div>
  );
}

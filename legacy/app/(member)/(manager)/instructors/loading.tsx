import { SkeletonTable } from "@/app/(member)/(manager)/_components/skeleton-table";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 md:py-8 lg:px-8">
      <SkeletonTable columns={5} rows={6} />
    </div>
  );
}

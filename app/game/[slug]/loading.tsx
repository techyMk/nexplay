import { Skeleton, SkeletonText, SkeletonGrid } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 md:py-10">
      <Skeleton className="h-5 w-20 mb-4" />

      {/* Title bar */}
      <div className="flex items-start gap-4 mb-6">
        <Skeleton className="hidden sm:block w-16 h-16 rounded-2xl" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 mb-10">
        <Skeleton className="aspect-video rounded-2xl" />
        <aside className="space-y-4">
          <Skeleton className="h-20 rounded-2xl" />
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
            <SkeletonText lines={2} />
            <SkeletonText lines={3} />
          </div>
        </aside>
      </div>

      <Skeleton className="h-7 w-48 mb-4" />
      <SkeletonGrid count={6} />
    </div>
  );
}

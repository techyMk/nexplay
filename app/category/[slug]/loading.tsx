import { Skeleton, SkeletonGrid } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 md:py-7 max-w-[1500px] mx-auto">
      <Skeleton className="h-5 w-20 mb-4" />
      <div className="mb-5 space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex gap-1.5 mb-6 overflow-hidden">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full shrink-0" />
        ))}
      </div>
      <SkeletonGrid count={18} />
    </div>
  );
}

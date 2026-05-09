import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 md:py-12">
      <Skeleton className="h-5 w-20 mb-4" />
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-16 w-32 rounded-2xl" />
      </div>
      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

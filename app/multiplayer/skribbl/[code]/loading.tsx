import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 md:py-10">
      <Skeleton className="h-5 w-20 mb-4" />

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 mb-4 flex items-center gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-7 w-32" />
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-4">
        <Skeleton className="aspect-[3/2] rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

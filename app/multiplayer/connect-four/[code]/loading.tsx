import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 md:py-10">
      <Skeleton className="h-5 w-20 mb-4" />

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 mb-4 flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-32" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-lg" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>

      <div className="rounded-2xl bg-blue-700 p-3 mx-auto" style={{ width: "min(70vh, 92vw, 520px)" }}>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 49 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

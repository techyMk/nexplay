/**
 * Skeleton loading primitives. Pure CSS via globals.css `.skeleton` class
 * (defined alongside this file) so animations work without JS.
 *
 * Use cases:
 *  - <Skeleton /> for a generic block; pass className for sizing
 *  - <SkeletonText lines={3} /> for paragraph placeholders
 *  - <SkeletonCard /> for a game-card-shaped placeholder
 *  - Compose into route-level loading.tsx files.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} aria-hidden />;
}

export function SkeletonText({
  lines = 1,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton h-3 rounded"
          style={{ width: i === lines - 1 ? "70%" : "100%" }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div aria-hidden>
      <div className="skeleton aspect-square rounded-2xl" />
      <div className="pt-2 px-0.5 space-y-2">
        <div className="skeleton h-3.5 rounded" style={{ width: "75%" }} />
        <div className="skeleton h-2.5 rounded" style={{ width: "55%" }} />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonRow({ count = 6 }: { count?: number }) {
  return (
    <div className="flex gap-3 overflow-hidden mb-8">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-36 sm:w-40 md:w-44 shrink-0">
          <SkeletonCard />
        </div>
      ))}
    </div>
  );
}

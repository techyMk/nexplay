import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8 md:py-12">
      <Skeleton className="h-5 w-28 mb-4" />
      <div className="text-center mb-10">
        <Skeleton className="h-16 w-16 rounded-full mx-auto mb-3" />
        <Skeleton className="h-9 w-72 mx-auto mb-2" />
        <Skeleton className="h-5 w-56 mx-auto" />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-6 md:p-10 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
      {/* Filter bar */}
      <div className="flex gap-3">
        <Skeleton className="h-10 w-40 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      {/* List rows */}
      <div className="bg-card rounded-xl border border-border divide-y divide-border">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="p-4 flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-full max-w-md" />
            <Skeleton className="h-5 w-24 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

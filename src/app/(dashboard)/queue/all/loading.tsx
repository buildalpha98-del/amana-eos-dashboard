import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-6 md:p-10 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-10 w-32 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <div className="bg-card rounded-xl border border-border divide-y divide-border">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="p-4 flex items-center gap-3">
            <Skeleton className="h-6 w-6 rounded" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-5 w-full max-w-sm" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

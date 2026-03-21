import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-6 md:p-10 space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-48 rounded-lg" />
        <div className="flex-1" />
        <Skeleton className="h-10 w-28 rounded-lg" />
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
      <div className="max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-full max-w-lg" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-6 space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

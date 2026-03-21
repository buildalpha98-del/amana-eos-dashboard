import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-6 md:p-10 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <div className="bg-card rounded-xl border border-border p-6">
        <Skeleton className="h-5 w-28 mb-4" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-6 md:p-10 space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="bg-card rounded-xl border border-border p-6 space-y-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <div className="bg-card rounded-xl border border-border p-6 space-y-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}

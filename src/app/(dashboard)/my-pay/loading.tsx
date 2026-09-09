import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Page header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-64" />
      </div>
      {/* Hero */}
      <Skeleton className="h-40 w-full rounded-2xl" />
      {/* Totals strip */}
      <Skeleton className="h-20 w-full rounded-xl" />
      {/* History */}
      <div className="bg-card rounded-xl border border-border p-6 space-y-3">
        <Skeleton className="h-5 w-40" />
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

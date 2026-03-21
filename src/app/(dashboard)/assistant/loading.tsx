import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-6 md:p-10 space-y-6">
      <Skeleton className="h-8 w-36" />
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-16 w-full max-w-lg rounded-lg" />
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-20 rounded-lg" />
      </div>
    </div>
  );
}

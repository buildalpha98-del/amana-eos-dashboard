import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-6 md:p-10 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-72" />
      </div>
      {[...Array(3)].map((_, s) => (
        <div key={s} className="space-y-3">
          <Skeleton className="h-5 w-48" />
          <div className="bg-card rounded-xl border border-border divide-y divide-border">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="p-4 flex items-center gap-3">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-full max-w-md" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

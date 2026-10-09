"use client";

/**
 * Staff → Staff inductions (2026-10-09, approved mock-up). The centre sees
 * who's cleared to work, who isn't, and exactly what each person is still
 * missing — the same items the person sees on their own training page —
 * with a nudge button. Clearing someone and signing off the practical stay
 * with the office (Onboarding → Induction).
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { BellRing, CheckCircle2 } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

interface Row {
  id: string;
  name: string;
  avatar: string | null;
  status: "new_starter" | "in_training" | "awaiting_signoff" | "cleared";
  dueDate: string | null;
  startDate: string | null;
  missing: string[];
}

const STATUS: Record<Row["status"], { label: string; cls: string }> = {
  new_starter: { label: "New starter", cls: "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200" },
  in_training: { label: "In training", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  awaiting_signoff: { label: "Needs sign-off", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  cleared: { label: "Cleared", cls: "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200" },
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" });

export function StaffInductions({ serviceId }: { serviceId: string }) {
  const { data, isLoading } = useQuery<{ rows: Row[] }>({
    queryKey: ["staff-inductions", serviceId],
    queryFn: () => fetchApi(`/api/services/${serviceId}/staff-inductions`),
    retry: 2,
  });
  const nudge = useMutation({
    mutationFn: (r: Row) =>
      mutateApi<{ sent: number }>(`/api/services/${serviceId}/staff-inductions`, {
        method: "POST",
        body: { userId: r.id },
      }),
    onSuccess: (res, r) =>
      toast({
        description: res.sent ? `Reminder sent to ${r.name}.` : `${r.name} has nothing left to do.`,
      }),
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  const rows = data?.rows ?? [];
  const todo = rows.filter((r) => r.status !== "cleared");
  const cleared = rows.filter((r) => r.status === "cleared");

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-heading text-lg font-semibold text-foreground">Staff inductions</h2>
        <p className="text-sm text-muted">
          {todo.length === 0
            ? "Everyone is cleared to work."
            : `${todo.length} still to finish · ${cleared.length} cleared`}
        </p>
      </div>

      {todo.length > 0 && (
        <ul className="space-y-2">
          {todo.map((r) => (
            <li key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/staff/${r.id}`} className="font-semibold text-foreground hover:underline">
                  {r.name}
                </Link>
                <span className={cn("rounded-full px-2 py-0.5 text-2xs font-semibold", STATUS[r.status].cls)}>
                  {STATUS[r.status].label}
                </span>
                {r.dueDate && (
                  <span
                    className={cn(
                      "text-xs",
                      new Date(r.dueDate) < new Date() ? "font-semibold text-red-700 dark:text-red-300" : "text-muted",
                    )}
                  >
                    Due {fmt(r.dueDate)}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  className="ml-auto"
                  disabled={nudge.isPending || r.missing.length === 0}
                  onClick={() => nudge.mutate(r)}
                >
                  <BellRing className="h-4 w-4" />
                  Remind
                </Button>
              </div>
              {r.missing.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {r.missing.map((m) => (
                    <li key={m} className="rounded-lg bg-surface px-2 py-1 text-xs text-foreground">
                      {m}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  Everything&rsquo;s done. Head office signs off their practical to clear them.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {cleared.length > 0 && (
        <section aria-labelledby="cleared-h" className="rounded-xl border border-border bg-card p-4">
          <h3 id="cleared-h" className="flex items-center gap-1.5 text-sm font-heading font-semibold text-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-700 dark:text-green-400" aria-hidden />
            Cleared to work · {cleared.length}
          </h3>
          <p className="mt-1 text-sm text-muted">{cleared.map((r) => r.name).join(", ")}</p>
        </section>
      )}
    </div>
  );
}

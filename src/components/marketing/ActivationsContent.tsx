"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";
import { useActivations, useMarkDelivered, type ActivationRow } from "@/hooks/useActivations";
import { Check, RotateCcw, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/useToast";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

function statusBadge(row: ActivationRow): { label: string; className: string } {
  if (row.activationDeliveredAt) {
    return { label: "Delivered", className: "bg-green-50 text-green-700 border-green-200" };
  }
  if (row.status === "delivered") {
    return { label: "Delivered (no date)", className: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  return { label: row.status, className: "bg-surface text-muted border-border" };
}

export default function ActivationsContent() {
  const { data, isLoading, isError, error, refetch } = useActivations();
  const markDelivered = useMarkDelivered();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Activations"
        description="Mark activations as delivered to trigger the recap-draft cron. (Sprint 7 will replace this with the full lifecycle stepper.)"
      />

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {isError && (
        <ErrorState
          title="Couldn't load activations"
          error={error ?? undefined}
          onRetry={() => refetch()}
        />
      )}

      {data && data.activations.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
          No activations found. Create campaigns of type event/launch and assign them to centres.
        </p>
      )}

      {data && data.activations.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs text-muted">
              <tr>
                <th className="text-left p-3 font-medium">Activation</th>
                <th className="text-left p-3 font-medium">Centre</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Delivered</th>
                <th className="text-left p-3 font-medium">Recap</th>
                <th className="text-right p-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.activations.map((row) => {
                const badge = statusBadge(row);
                return (
                  <tr key={row.id} className="border-t border-border">
                    <td className="p-3">
                      <div className="font-medium text-foreground">{row.campaign.name}</div>
                      <div className="text-xs text-muted capitalize">{row.campaign.type}</div>
                    </td>
                    <td className="p-3 text-foreground">{row.service.name}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="p-3 text-muted">{formatDate(row.activationDeliveredAt)}</td>
                    <td className="p-3">
                      {row.recapPostId ? (
                        <a
                          href={`/marketing?postId=${row.recapPostId}`}
                          className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                        >
                          {row.recapPostStatus ?? "draft"}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {row.activationDeliveredAt ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          iconLeft={<RotateCcw className="w-4 h-4" />}
                          onClick={async () => {
                            try {
                              await markDelivered.mutateAsync({ id: row.id, undo: true });
                              toast({ description: "Marked as not yet delivered" });
                            } catch {
                              // hook toast
                            }
                          }}
                          disabled={markDelivered.isPending}
                        >
                          Undo
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="primary"
                          iconLeft={<Check className="w-4 h-4" />}
                          onClick={async () => {
                            try {
                              await markDelivered.mutateAsync({ id: row.id });
                              toast({ description: "Marked delivered — recap draft will appear within 48h." });
                            } catch {
                              // hook toast
                            }
                          }}
                          disabled={markDelivered.isPending}
                        >
                          Mark delivered
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

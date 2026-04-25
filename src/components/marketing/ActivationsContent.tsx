"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";
import {
  useActivations,
  useMarkDelivered,
  type ActivationRow,
  type UnassignedCampaign,
} from "@/hooks/useActivations";
import { Check, RotateCcw, ExternalLink, AlertCircle } from "lucide-react";
import Link from "next/link";
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

function UnassignedSection({ campaigns }: { campaigns: UnassignedCampaign[] }) {
  if (campaigns.length === 0) return null;
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <header className="flex items-start gap-2 mb-3">
        <AlertCircle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-amber-900">
            {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"} awaiting centre assignment
          </h3>
          <p className="text-xs text-amber-800 mt-0.5">
            These campaigns won&apos;t appear as activations until you assign them to one or more centres.
            Open each campaign in the Marketing tab → scroll to <strong>Activation Assignments</strong> →
            tick the centre(s) → save.
          </p>
        </div>
      </header>
      <ul className="space-y-2">
        {campaigns.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-card p-2.5">
            <div className="min-w-0">
              <div className="font-medium text-foreground truncate">{c.name}</div>
              <div className="text-xs text-muted capitalize">
                {c.type} · {c.status}
                {c.startDate && ` · starts ${formatDate(c.startDate)}`}
              </div>
            </div>
            <Link
              href={`/marketing?campaignId=${c.id}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border bg-card text-xs font-medium text-brand hover:bg-surface shrink-0"
            >
              Assign centres
              <ExternalLink className="w-3 h-3" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ActivationsContent() {
  const { data, isLoading, isError, error, refetch } = useActivations();
  const markDelivered = useMarkDelivered();

  const hasNoActivations = data && data.activations.length === 0;
  const hasUnassigned = data && data.unassignedCampaigns.length > 0;
  const hasNothing = data && !hasUnassigned && hasNoActivations;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Activations"
        description="One row per (campaign × centre) assignment. Mark each delivered to trigger the recap-draft cron 48h later."
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

      {data && hasUnassigned && <UnassignedSection campaigns={data.unassignedCampaigns} />}

      {hasNothing && (
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted space-y-2">
          <p className="font-medium text-foreground">No campaigns yet.</p>
          <p>
            Activations are created when you take a Campaign of type{" "}
            <em>event</em>, <em>launch</em>, or <em>activation</em> and assign it to one or more centres.
          </p>
          <p>
            Start in the{" "}
            <Link href="/marketing" className="text-brand hover:underline">
              Marketing tab
            </Link>{" "}
            → Campaigns → New Campaign → open it → assign to centres.
          </p>
        </div>
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

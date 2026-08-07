"use client";

/**
 * The discount arrangement for this child.
 *
 * Sits with the recurring booking pattern because that's when the
 * question comes up: you're setting a staff member's child onto three
 * days a week, and the 95% staff rate is part of the same conversation.
 *
 * Recorded, not applied. The booking still carries the room's list
 * price; this is the arrangement whoever bills reads. A price that
 * quietly reduces itself is one nobody chose.
 *
 * BACKDATING is deliberately allowed. A staff rate agreed in February
 * and entered in April started in February, and the arrangement should
 * say so — otherwise the record disagrees with what was actually agreed.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Percent, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { formatCents } from "@/lib/family-billing";

interface DiscountRow {
  id: string;
  childId: string | null;
  childName: string | null;
  roomName: string;
  kind: string;
  value: number;
  reason: string;
  startDate: string;
  endDate: string | null;
  active: boolean;
  createdBy: string | null;
}

/** The rates a centre actually grants, plus a free-text option. */
const PRESETS = [
  { label: "Staff — 95%", value: 95, reason: "Staff discount" },
  { label: "Staff — 50%", value: 50, reason: "Staff discount" },
  { label: "Sibling — 10%", value: 10, reason: "Sibling discount" },
];

const field =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

const dateAU = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export function ChildDiscountCard({
  childId,
  serviceId,
  childName,
  canEdit,
}: {
  childId: string;
  serviceId: string | null;
  childName: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const key = ["child", childId, "discounts"];
  const [adding, setAdding] = useState(false);
  const [percent, setPercent] = useState("");
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState("");

  const { data, isLoading } = useQuery<{ discounts: DiscountRow[] }>({
    queryKey: key,
    queryFn: () =>
      fetchApi(
        `/api/services/${serviceId}/family-discounts?childId=${childId}`,
      ),
    enabled: Boolean(serviceId),
    retry: 1,
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi(`/api/services/${serviceId}/family-discounts`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setAdding(false);
      setPercent("");
      setReason("");
      toast({ description: "Discount recorded." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const end = useMutation({
    mutationFn: (discountId: string) =>
      mutateApi(
        `/api/services/${serviceId}/family-discounts?discountId=${discountId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ description: "Ended today." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  if (!serviceId) return null;

  const rows = data?.discounts ?? [];
  const active = rows.filter((r) => r.active);

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Percent className="h-4 w-4 text-brand" />
            Discount
          </h3>
          <p className="text-xs text-muted mt-0.5">
            A staff or sibling rate for {childName}. Recorded here and
            applied when you bill — it doesn&apos;t change a price on its own.
          </p>
        </div>
        {canEdit && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        )}
      </div>

      {adding && (
        <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setPercent(String(p.value));
                  setReason(p.reason);
                }}
                className="min-h-9 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-surface"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="cd-pct" className="block text-sm font-medium text-foreground mb-1">
                Percentage off
              </label>
              <input
                id="cd-pct"
                inputMode="decimal"
                className={field}
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                placeholder="e.g. 95"
              />
            </div>
            <div>
              <label htmlFor="cd-start" className="block text-sm font-medium text-foreground mb-1">
                Starts
              </label>
              <input
                id="cd-start"
                type="date"
                className={field}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <p className="mt-1 text-2xs text-muted">
                Can be backdated — put the date it was actually agreed.
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="cd-reason" className="block text-sm font-medium text-foreground mb-1">
              Why
            </label>
            <input
              id="cd-reason"
              className={field}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Staff discount"
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => {
                const n = Number(percent);
                if (!Number.isFinite(n) || n <= 0 || n > 100) {
                  toast({
                    variant: "destructive",
                    description: "A percentage between 1 and 100, please.",
                  });
                  return;
                }
                create.mutate({
                  childId,
                  kind: "percent",
                  value: n,
                  reason: reason.trim(),
                  startDate,
                });
              }}
              disabled={
                create.isPending || !percent.trim() || !reason.trim() || !startDate
              }
            >
              {create.isPending ? "Saving…" : "Save discount"}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-16 w-full rounded-lg" />
      ) : active.length === 0 ? (
        <p className="text-sm text-muted">
          No discount. {childName} is charged the room&apos;s fee.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {active.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  <strong>
                    {d.kind === "percent"
                      ? `${d.value}% off`
                      : `${formatCents(d.value)} off`}
                  </strong>
                  <span className="text-muted"> · {d.reason}</span>
                </p>
                <p className="text-xs text-muted">
                  {/* A family-wide arrangement reaches this child too —
                      say which it is, so nobody double-grants it. */}
                  {d.childId ? `Just ${childName}` : "Whole family"} ·{" "}
                  {d.roomName} · from {dateAU(d.startDate)}
                  {d.endDate ? ` until ${dateAU(d.endDate)}` : ""}
                  {d.createdBy && ` · ${d.createdBy}`}
                </p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => end.mutate(d.id)}
                  aria-label={`End the ${d.reason}`}
                  title="End today"
                  className="shrink-0 rounded-lg p-2 text-muted hover:bg-surface hover:text-foreground min-h-11 min-w-11"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

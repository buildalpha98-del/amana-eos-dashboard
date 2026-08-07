"use client";

/**
 * Standing discounts on what families pay.
 *
 * OWNA's nearest equivalent is "Room Discount", hung off the room. That
 * models the wrong noun: a discount follows a FAMILY across rooms,
 * survives a fee rise, and ends on a date. Hanging it off the room means
 * re-applying it every time the fee matrix changes.
 *
 * Ending a discount doesn't delete it — one that's been applied to real
 * invoices is part of the record of what a family was charged.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Percent, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { formatCents } from "@/lib/family-billing";
import {
  activeSessionKeys,
  roomLabel,
  type SessionTimes,
} from "@/lib/service-settings";

interface DiscountRow {
  id: string;
  contactId: string;
  familyName: string;
  sessionType: string | null;
  roomName: string;
  kind: string;
  value: number;
  reason: string;
  startDate: string;
  endDate: string | null;
  active: boolean;
  createdBy: string | null;
}

interface FamilyOption {
  id: string;
  name: string;
}

const field =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

const dateAU = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** "20% off" or "$5.00 off" — how a coordinator says it out loud. */
function describe(d: DiscountRow): string {
  return d.kind === "percent"
    ? `${d.value}% off`
    : `${formatCents(d.value)} off`;
}

export function FamilyDiscountsCard({
  serviceId,
  sessionTimes,
  families,
}: {
  serviceId: string;
  sessionTimes?: SessionTimes | null;
  /** Families at this centre, for the picker. */
  families: FamilyOption[];
}) {
  const qc = useQueryClient();
  const key = ["service", serviceId, "family-discounts"];
  const [adding, setAdding] = useState(false);
  const [contactId, setContactId] = useState("");
  const [sessionType, setSessionType] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data, isLoading } = useQuery<{ discounts: DiscountRow[] }>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/services/${serviceId}/family-discounts`),
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
      setValue("");
      setReason("");
      setEndDate("");
      toast({ description: "Discount added." });
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

  const rows = data?.discounts ?? [];
  const active = rows.filter((r) => r.active);
  const past = rows.filter((r) => !r.active);
  const rooms = activeSessionKeys(sessionTimes);

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Percent className="h-4 w-4 text-brand" />
            Family discounts
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Sibling rates, staff rates, hardship. Applied to what the family
            is charged, and it follows them if the fee changes.
          </p>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        )}
      </div>

      {adding && (
        <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="fd-family" className="block text-sm font-medium text-foreground mb-1">
                Family
              </label>
              <select
                id="fd-family"
                className={field}
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
              >
                <option value="">Choose…</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fd-room" className="block text-sm font-medium text-foreground mb-1">
                Applies to
              </label>
              <select
                id="fd-room"
                className={field}
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value)}
              >
                <option value="">Every room</option>
                {rooms.map((r) => (
                  <option key={r} value={r}>
                    {roomLabel(sessionTimes, r)} only
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fd-kind" className="block text-sm font-medium text-foreground mb-1">
                Kind
              </label>
              <select
                id="fd-kind"
                className={field}
                value={kind}
                onChange={(e) => setKind(e.target.value as "percent" | "amount")}
              >
                <option value="percent">Percentage off</option>
                <option value="amount">Dollars off</option>
              </select>
            </div>
            <div>
              <label htmlFor="fd-value" className="block text-sm font-medium text-foreground mb-1">
                {kind === "percent" ? "Percent" : "Dollars"}
              </label>
              <input
                id="fd-value"
                inputMode="decimal"
                className={field}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={kind === "percent" ? "e.g. 20" : "e.g. 5.00"}
              />
            </div>
            <div>
              <label htmlFor="fd-start" className="block text-sm font-medium text-foreground mb-1">
                From
              </label>
              <input
                id="fd-start"
                type="date"
                className={field}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="fd-end" className="block text-sm font-medium text-foreground mb-1">
                Until <span className="text-muted">(blank = ongoing)</span>
              </label>
              <input
                id="fd-end"
                type="date"
                className={field}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="fd-reason" className="block text-sm font-medium text-foreground mb-1">
              Why
            </label>
            <input
              id="fd-reason"
              className={field}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Sibling, Staff rate, Hardship"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                const n = Number(value);
                if (!Number.isFinite(n) || n <= 0) {
                  toast({
                    variant: "destructive",
                    description: "The discount needs a number greater than zero.",
                  });
                  return;
                }
                create.mutate({
                  contactId,
                  kind,
                  value: n,
                  reason: reason.trim(),
                  startDate,
                  ...(sessionType ? { sessionType } : {}),
                  ...(endDate ? { endDate } : {}),
                });
              }}
              disabled={
                create.isPending ||
                !contactId ||
                !value.trim() ||
                !reason.trim() ||
                !startDate
              }
            >
              {create.isPending ? "Adding…" : "Add discount"}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">
          No discounts. Everyone pays the room&apos;s fee.
        </p>
      ) : (
        <>
          {active.length > 0 && (
            <ul className="divide-y divide-border">
              {active.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">
                      <strong>{d.familyName}</strong> — {describe(d)}
                      <span className="text-muted"> · {d.reason}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {d.roomName} · from {dateAU(d.startDate)}
                      {d.endDate ? ` until ${dateAU(d.endDate)}` : " · ongoing"}
                      {d.createdBy && ` · ${d.createdBy}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => end.mutate(d.id)}
                    aria-label={`End the ${d.reason} discount for ${d.familyName}`}
                    title="End today"
                    className="shrink-0 rounded-lg p-2 text-muted hover:bg-surface hover:text-foreground min-h-11 min-w-11"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {past.length > 0 && (
            <p className="text-xs text-muted">
              {past.length} finished — kept so past invoices still make sense.
            </p>
          )}
        </>
      )}
    </div>
  );
}

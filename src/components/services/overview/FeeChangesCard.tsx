"use client";

/**
 * Scheduled fee changes, and the history of applied ones.
 *
 * A centre decides in July that the rate changes in August. Until now
 * that lived in someone's calendar and got done by hand on the day,
 * which is how a rise gets missed — or applied a fortnight early to
 * families who were quoted the old price.
 *
 * The history half matters just as much: "who put the rate up, and
 * when" is the question that arrives with a fee dispute, and it needs an
 * answer that isn't someone's memory.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { formatCents } from "@/lib/family-billing";
import {
  activeSessionKeys,
  roomFees,
  roomLabel,
  type SessionTimes,
} from "@/lib/service-settings";

interface FeeChangeRow {
  id: string;
  sessionType: string;
  roomName: string;
  feeName: string;
  fromAmountCents: number | null;
  toAmountCents: number;
  effectiveDate: string;
  status: string;
  appliedAt: string | null;
  note: string | null;
  createdBy: string | null;
}

const field =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

const dateAU = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export function FeeChangesCard({
  serviceId,
  sessionTimes,
  canEdit,
}: {
  serviceId: string;
  sessionTimes: SessionTimes | null | undefined;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const key = ["service", serviceId, "fee-changes"];
  const [adding, setAdding] = useState(false);
  const [sessionType, setSessionType] = useState("");
  const [feeTierId, setFeeTierId] = useState("");
  const [amount, setAmount] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [note, setNote] = useState("");

  const { data } = useQuery<{ changes: FeeChangeRow[] }>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/services/${serviceId}/fee-changes`),
    retry: 1,
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi(`/api/services/${serviceId}/fee-changes`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      // The price itself may have changed if it was effective today.
      qc.invalidateQueries({ queryKey: ["service", serviceId] });
      setAdding(false);
      setAmount("");
      setEffectiveDate("");
      setNote("");
      toast({ description: "Rate change scheduled." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const cancel = useMutation({
    mutationFn: (changeId: string) =>
      mutateApi(`/api/services/${serviceId}/fee-changes?changeId=${changeId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ description: "Cancelled." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const rows = data?.changes ?? [];
  const upcoming = rows.filter((r) => r.status === "scheduled");
  const history = rows.filter((r) => r.status === "applied").slice(0, 8);

  const programmes = activeSessionKeys(sessionTimes);
  const feesForRoom = sessionType
    ? roomFees(sessionTimes, sessionType as never)
    : [];

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <CalendarClock className="h-4 w-4 text-brand" />
            Fee changes
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Set a new rate to start on a date. It applies itself that
            morning, and every change stays on the record.
          </p>
        </div>
        {canEdit && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" /> Schedule
          </Button>
        )}
      </div>

      {adding && (
        <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="fc-room" className="block text-sm font-medium text-foreground mb-1">
                Room
              </label>
              <select
                id="fc-room"
                className={field}
                value={sessionType}
                onChange={(e) => {
                  setSessionType(e.target.value);
                  setFeeTierId("");
                }}
              >
                <option value="">Choose…</option>
                {programmes.map((p) => (
                  <option key={p} value={p}>
                    {roomLabel(sessionTimes, p)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fc-fee" className="block text-sm font-medium text-foreground mb-1">
                Fee
              </label>
              <select
                id="fc-fee"
                className={field}
                value={feeTierId}
                onChange={(e) => setFeeTierId(e.target.value)}
                disabled={!sessionType}
              >
                <option value="">
                  {sessionType ? "Choose…" : "Pick a room first"}
                </option>
                {feesForRoom.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} — {formatCents(f.amountCents)} now
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fc-amount" className="block text-sm font-medium text-foreground mb-1">
                New rate
              </label>
              <input
                id="fc-amount"
                inputMode="decimal"
                className={field}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 45.00"
              />
            </div>
            <div>
              <label htmlFor="fc-date" className="block text-sm font-medium text-foreground mb-1">
                Starts on
              </label>
              <input
                id="fc-date"
                type="date"
                className={field}
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="fc-note" className="block text-sm font-medium text-foreground mb-1">
              Note <span className="text-muted">(optional)</span>
            </label>
            <input
              id="fc-note"
              className={field}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. approved at the July board meeting"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                const parsedAmount = Number(amount);
                if (!Number.isFinite(parsedAmount)) {
                  toast({
                    variant: "destructive",
                    description: "The new rate needs to be a number, e.g. 45.00",
                  });
                  return;
                }
                create.mutate({
                  sessionType,
                  feeTierId,
                  amount: parsedAmount,
                  effectiveDate,
                  ...(note.trim() ? { note: note.trim() } : {}),
                });
              }}
              disabled={
                create.isPending ||
                !sessionType ||
                !feeTierId ||
                !amount.trim() ||
                !effectiveDate
              }
            >
              {create.isPending ? "Scheduling…" : "Schedule"}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted mb-1">Coming up</p>
          <ul className="divide-y divide-border">
            {upcoming.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    <strong>{r.roomName}</strong> · {r.feeName}{" "}
                    {r.fromAmountCents != null && (
                      <span className="text-muted">
                        {formatCents(r.fromAmountCents)} →{" "}
                      </span>
                    )}
                    <strong>{formatCents(r.toAmountCents)}</strong>
                  </p>
                  <p className="text-xs text-muted">
                    From {dateAU(r.effectiveDate)}
                    {r.createdBy && ` · set by ${r.createdBy}`}
                    {r.note && ` · ${r.note}`}
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => cancel.mutate(r.id)}
                    aria-label={`Cancel the ${r.feeName} change`}
                    className="shrink-0 rounded-lg p-2 text-muted hover:bg-surface hover:text-foreground min-h-11 min-w-11"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted mb-1">
            Already applied
          </p>
          <ul className="space-y-1">
            {history.map((r) => (
              <li key={r.id} className="flex items-start gap-1.5 text-xs text-muted">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
                <span>
                  {r.roomName} · {r.feeName} →{" "}
                  {formatCents(r.toAmountCents)} on {dateAU(r.effectiveDate)}
                  {r.createdBy && ` · ${r.createdBy}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {upcoming.length === 0 && history.length === 0 && !adding && (
        <p className="text-sm text-muted">
          No rate changes scheduled.
        </p>
      )}
    </div>
  );
}

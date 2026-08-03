"use client";

/**
 * Draft an invoice from a family's actual confirmed bookings.
 *
 * Before this, POST /api/billing/statements required every line item to
 * be typed by hand — so invoicing a family meant a staff member copying
 * each session across from another screen. Nothing derived the lines from
 * what a child actually attended, which is the reason invoicing still
 * happens in OWNA.
 *
 * Produces a DRAFT. Nothing reaches a family until staff issue it.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

interface ServiceOption {
  id: string;
  name: string;
}
interface FamilyOption {
  id: string;
  name: string | null;
  familyName: string | null;
  email: string;
}

interface GenerateResult {
  ok: boolean;
  reason?: string;
  message?: string;
  statement?: { id: string };
  sessionsBilled?: number;
  skippedAlreadyBilled?: number;
}

const control =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

/** Monday of the current week, as YYYY-MM-DD — the usual period start. */
function thisMonday(): string {
  const d = new Date();
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function GenerateStatementDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [serviceId, setServiceId] = useState("");
  const [contactId, setContactId] = useState("");
  const [periodStart, setPeriodStart] = useState(thisMonday());
  const [periodEnd, setPeriodEnd] = useState(addDays(thisMonday(), 6));
  const [dueDate, setDueDate] = useState("");

  const { data: services } = useQuery<ServiceOption[]>({
    queryKey: ["services", "options"],
    queryFn: () => fetchApi("/api/services"),
    enabled: open,
    retry: 1,
  });

  // Families are keyed to a CentreContact for billing, which is what the
  // statement hangs off — not the ParentAccount.
  const { data: contacts } = useQuery<{ contacts: FamilyOption[] }>({
    queryKey: ["centre-contacts", serviceId],
    queryFn: () =>
      fetchApi(`/api/centre-contacts?serviceId=${encodeURIComponent(serviceId)}`),
    enabled: open && Boolean(serviceId),
    retry: 1,
  });

  const generate = useMutation<GenerateResult, Error, void>({
    mutationFn: () =>
      mutateApi<GenerateResult>("/api/billing/statements/generate", {
        method: "POST",
        body: {
          contactId,
          serviceId,
          periodStart,
          periodEnd,
          ...(dueDate ? { dueDate } : {}),
        },
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        // Not an error — "nothing to bill" and "already billed" are
        // normal answers, and saying so beats a red toast.
        toast({ description: res.message ?? "Nothing to invoice for that period." });
        return;
      }
      qc.invalidateQueries({ queryKey: ["statements"] });
      qc.invalidateQueries({ queryKey: ["billing"] });
      toast({
        description:
          `Draft created from ${res.sessionsBilled} session${res.sessionsBilled === 1 ? "" : "s"}` +
          (res.skippedAlreadyBilled
            ? ` — ${res.skippedAlreadyBilled} skipped, already invoiced.`
            : "."),
      });
      onOpenChange(false);
    },
    onError: (e) => toast({ variant: "destructive", description: e.message }),
  });

  const ready = serviceId && contactId && periodStart && periodEnd;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Generate from bookings</DialogTitle>
        <DialogDescription>
          Builds a draft invoice from a family&apos;s confirmed sessions.
          Sessions already on a live invoice are skipped, so running this
          twice won&apos;t double-bill.
        </DialogDescription>

        <div className="space-y-3 mt-4">
          <div>
            <label htmlFor="gs-service" className="block text-sm font-medium mb-1">
              Service
            </label>
            <select
              id="gs-service"
              className={control}
              value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value);
                setContactId("");
              }}
            >
              <option value="">Select a service…</option>
              {(services ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="gs-family" className="block text-sm font-medium mb-1">
              Family
            </label>
            <select
              id="gs-family"
              className={control}
              value={contactId}
              disabled={!serviceId}
              onChange={(e) => setContactId(e.target.value)}
            >
              <option value="">
                {serviceId ? "Select a family…" : "Choose a service first"}
              </option>
              {(contacts?.contacts ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.familyName ?? c.name ?? c.email}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="gs-from" className="block text-sm font-medium mb-1">
                Period from
              </label>
              <input
                id="gs-from"
                type="date"
                className={control}
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="gs-to" className="block text-sm font-medium mb-1">
                Period to
              </label>
              <input
                id="gs-to"
                type="date"
                className={control}
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="gs-due" className="block text-sm font-medium mb-1">
              Due date <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              id="gs-due"
              type="date"
              className={control}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => generate.mutate()}
              disabled={!ready || generate.isPending}
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Generate draft
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

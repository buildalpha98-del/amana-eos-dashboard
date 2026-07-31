"use client";

/**
 * Bulk billing controls for the Families list.
 *
 * Mirrors the three OWNA actions Daniel uses: set the next billing date +
 * period across a group, change the preferred debit day, and set or clear
 * the debit limit.
 *
 * Collapsed by default. It rewrites billing for many families at once, so
 * it shouldn't sit open and one stray click away on a page staff visit to
 * look things up.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Users } from "lucide-react";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import {
  BILLING_FREQUENCIES,
  WEEKDAY_NAMES,
  parseDollarsToCents,
} from "@/lib/family-billing";

interface FamilyOption {
  id: string;
  label: string;
}

const control =
  "px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

export function BulkBillingPanel({ families }: { families: FamilyOption[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [allActive, setAllActive] = useState(false);

  const [nextBillingDate, setNextBillingDate] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [frequency, setFrequency] = useState("");
  const [anchorDay, setAnchorDay] = useState("");
  const [limit, setLimit] = useState("");
  const [clearLimit, setClearLimit] = useState(false);

  const apply = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi<{ updated: number }>("/api/families/bulk-billing", {
        method: "POST",
        body: { ...body, familyIds: selected, allActive },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["families"] });
      toast({
        description: `Updated ${res.updated} ${res.updated === 1 ? "family" : "families"}.`,
      });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const targetCount = allActive ? families.length : selected.length;
  const targetLabel = allActive
    ? `all ${families.length} families`
    : `${selected.length} selected`;

  const guard = (run: () => void) => {
    if (targetCount === 0) {
      toast({
        variant: "destructive",
        description: "Select at least one family, or tick 'all families'.",
      });
      return;
    }
    run();
  };

  return (
    <section className="bg-card rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-5 py-3 text-left"
      >
        <Users className="w-4 h-4 text-brand shrink-0" />
        <span className="text-sm font-semibold text-foreground flex-1">
          Bulk billing
        </span>
        <span className="text-xs text-muted">
          {open ? "Hide" : "Set dates, debit day or limits for many families"}
        </span>
        <ChevronDown
          className={
            "w-4 h-4 text-muted transition-transform " + (open ? "rotate-180" : "")
          }
        />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-border pt-4">
          {/* ── Who ── */}
          <div>
            <span className="block text-sm font-medium text-foreground mb-2">
              Apply to
            </span>
            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allActive}
                onChange={(e) => setAllActive(e.target.checked)}
                className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
              />
              <span className="text-sm text-foreground">
                All families ({families.length})
              </span>
            </label>
            {!allActive && (
              <select
                multiple
                size={6}
                value={selected}
                onChange={(e) =>
                  setSelected(
                    Array.from(e.target.selectedOptions, (o) => o.value),
                  )
                }
                className={`${control} w-full max-w-md`}
                aria-label="Select families"
              >
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            )}
            <p className="mt-1 text-xs text-muted">
              Applying to {targetLabel}.
            </p>
          </div>

          {/* ── Billing dates ── */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">
              Billing dates
            </h3>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="bb-next" className="block text-xs text-muted mb-1">
                  Next billing date
                </label>
                <input
                  id="bb-next"
                  type="date"
                  className={control}
                  value={nextBillingDate}
                  onChange={(e) => setNextBillingDate(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="bb-period" className="block text-xs text-muted mb-1">
                  Period starting
                </label>
                <input
                  id="bb-period"
                  type="date"
                  className={control}
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="bb-freq" className="block text-xs text-muted mb-1">
                  Cycle
                </label>
                <select
                  id="bb-freq"
                  className={control}
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                >
                  <option value="">Leave unchanged</option>
                  {BILLING_FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                onClick={() =>
                  guard(() =>
                    apply.mutate({
                      ...(nextBillingDate ? { nextBillingDate } : {}),
                      ...(periodStart ? { billingPeriodStart: periodStart } : {}),
                      ...(frequency ? { billingFrequency: frequency } : {}),
                    }),
                  )
                }
                disabled={
                  apply.isPending ||
                  (!nextBillingDate && !periodStart && !frequency)
                }
              >
                {apply.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Update billing dates"
                )}
              </Button>
            </div>
          </div>

          {/* ── Debit day ── */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">
              Preferred debit day
            </h3>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="bb-day" className="block text-xs text-muted mb-1">
                  Day
                </label>
                <select
                  id="bb-day"
                  className={control}
                  value={anchorDay}
                  onChange={(e) => setAnchorDay(e.target.value)}
                >
                  <option value="">Select a day</option>
                  {WEEKDAY_NAMES.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  guard(() =>
                    apply.mutate({
                      billingAnchorDay: Number(anchorDay),
                      // Sent together so the server validates the day
                      // against the cycle it will actually belong to.
                      ...(frequency ? { billingFrequency: frequency } : {}),
                    }),
                  )
                }
                disabled={apply.isPending || !anchorDay}
              >
                Update debit day
              </Button>
            </div>
          </div>

          {/* ── Debit limit ── */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-1">
              Debit limit
            </h3>
            <p className="text-xs text-muted mb-2">
              The most that can be debited from a family, whatever the invoice
              says.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="bb-limit" className="block text-xs text-muted mb-1">
                  Set limit
                </label>
                <input
                  id="bb-limit"
                  className={control}
                  inputMode="decimal"
                  placeholder="e.g. 500.00"
                  value={limit}
                  disabled={clearLimit}
                  onChange={(e) => setLimit(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={clearLimit}
                  onChange={(e) => setClearLimit(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                />
                <span className="text-sm text-foreground">
                  Remove limits instead
                </span>
              </label>
              <Button
                variant="outline"
                onClick={() =>
                  guard(() => {
                    if (clearLimit) {
                      apply.mutate({ billingLimitCents: null });
                      return;
                    }
                    const cents = parseDollarsToCents(limit);
                    if (cents === undefined || cents === null) {
                      // undefined = unreadable, null = blank. Neither is a
                      // limit, and neither should quietly clear everyone's.
                      toast({
                        variant: "destructive",
                        description:
                          "Enter a dollar amount, e.g. 500 or 500.00 — or tick 'Remove limits instead'.",
                      });
                      return;
                    }
                    apply.mutate({ billingLimitCents: cents });
                  })
                }
                disabled={apply.isPending}
              >
                {clearLimit ? "Remove debit limits" : "Update debit limit"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

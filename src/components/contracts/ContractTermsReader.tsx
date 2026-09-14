"use client";

/**
 * "Read pay details from the document" — the backfill counterpart to the
 * reader built into ContractQuickUpload.
 *
 * quick-upload has always defaulted `payRate` to 0 (the PDF was treated as
 * the source of truth and nobody retyped the figure), so the contracts
 * table carries a long tail of rows reading $0.00/hr while the real rate
 * sits inside the attached document. This reads that document and offers
 * the values; the admin applies them.
 *
 * Applying is a deliberate, separate click. A pay rate flows into payroll
 * and a misread costs an educator money, so the model never writes one on
 * its own — and a reviewed suggestion is also what keeps reading an
 * uploaded document safe.
 */

import { useState } from "react";
import { AlertTriangle, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/useToast";
import { useUpdateContract } from "@/hooks/useContracts";

export interface ContractTerms {
  payRate: number | null;
  payRateBasis: "hourly" | "weekly" | "annual" | null;
  payRateQuote: string | null;
  payRateDerived: boolean;
  hoursPerWeek: number | null;
  contractType: string | null;
  classification: string | null;
  startDate: string | null;
  endDate: string | null;
  confidence: "high" | "medium" | "low";
  notes: string | null;
}

interface Props {
  contractId: string;
  /** Current stored rate — drives the "still $0.00/hr" prompt. */
  currentPayRate: number;
  hasDocument: boolean;
}

export function ContractTermsReader({
  contractId,
  currentPayRate,
  hasDocument,
}: Props) {
  const [reading, setReading] = useState(false);
  const [terms, setTerms] = useState<ContractTerms | null>(null);
  const update = useUpdateContract();

  if (!hasDocument) return null;

  async function read() {
    setReading(true);
    setTerms(null);
    try {
      const res = await fetch("/api/contracts/extract-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't read the contract");
      }
      const { terms: found } = (await res.json()) as { terms: ContractTerms };
      setTerms(found);
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          err instanceof Error ? err.message : "Couldn't read the contract",
      });
    } finally {
      setReading(false);
    }
  }

  function apply() {
    if (!terms?.payRate) return;
    update.mutate(
      {
        id: contractId,
        payRate: terms.payRate,
        // Only send hours when the document actually stated them —
        // an omitted field leaves the stored value alone, whereas null
        // would wipe it.
        ...(terms.hoursPerWeek !== null
          ? { hoursPerWeek: terms.hoursPerWeek }
          : {}),
      },
      {
        onSuccess: () => {
          toast({ description: "Pay rate updated from the contract." });
          setTerms(null);
        },
      },
    );
  }

  const needsRate = currentPayRate === 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-brand" />
            Read pay details from the document
          </h3>
          <p className="text-xs text-muted mt-0.5">
            {needsRate
              ? "This contract has no pay rate recorded. The figure is likely inside the attached document."
              : "Check the recorded pay rate against what the document says."}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void read()}
          loading={reading}
          className="shrink-0"
        >
          {reading ? "Reading…" : "Read document"}
        </Button>
      </div>

      {terms && (
        <div className="rounded-lg border border-border bg-surface/60 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-foreground">
              {terms.payRate !== null
                ? `Found: $${terms.payRate.toFixed(2)}/hr`
                : "No pay rate found in this document"}
            </p>
            <span
              className={cn(
                "text-2xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0",
                terms.confidence === "high"
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                  : terms.confidence === "medium"
                    ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
                    : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300",
              )}
            >
              {terms.confidence}
            </span>
          </div>

          {terms.payRateDerived && (
            <p className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Calculated from a{" "}
              {terms.payRateBasis === "annual" ? "yearly" : "weekly"} figure
              {terms.hoursPerWeek
                ? ` over ${terms.hoursPerWeek} hours a week`
                : " over a 38-hour week"}
              , not read directly.
            </p>
          )}

          {terms.payRateQuote && (
            <p className="text-xs text-muted italic border-l-2 border-border pl-2">
              &ldquo;{terms.payRateQuote}&rdquo;
            </p>
          )}

          {terms.hoursPerWeek !== null && (
            <p className="text-xs text-muted">
              Hours per week: {terms.hoursPerWeek}
            </p>
          )}
          {terms.classification && (
            <p className="text-xs text-muted">
              Classification: {terms.classification}
            </p>
          )}
          {terms.notes && <p className="text-xs text-muted">{terms.notes}</p>}

          {terms.payRate !== null && (
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={apply}
                loading={update.isPending}
                iconLeft={<Check className="w-4 h-4" />}
                className="shrink-0"
              >
                {update.isPending
                  ? "Saving…"
                  : `Set pay rate to $${terms.payRate.toFixed(2)}/hr`}
              </Button>
              <button
                type="button"
                onClick={() => setTerms(null)}
                className="text-xs text-muted hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * /billing/aged-debtors — who owes what, oldest first.
 *
 * Distinct from the OverdueFeeRecord register behind /api/billing/overdue —
 * a manually-imported record of debt that lived in OWNA. NOTE: that API
 * has full CRUD and an XLSX importer but NO page, so it is currently
 * unreachable (found in the 2026-08-01 orphan sweep). This report is
 * computed from invoices this system issued, so it stays correct without
 * anyone re-importing a spreadsheet.
 */

import { Fragment, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Mail } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMoney, type AgedBucketKey } from "@/lib/money";

interface Bucket {
  key: AgedBucketKey;
  label: string;
}

interface FamilyDebt {
  contactId: string;
  name: string;
  email: string | null;
  serviceName: string | null;
  oldestDays: number;
  totals: Record<AgedBucketKey, number> & { total: number };
  statements: {
    id: string;
    balanceCents: number;
    dueDate: string | null;
    daysOverdue: number;
    bucket: AgedBucketKey;
  }[];
}

interface AgedResponse {
  asOf: string;
  buckets: Bucket[];
  totals: Record<AgedBucketKey, number> & { total: number };
  families: FamilyDebt[];
}

/** Older debt reads hotter — the 90+ column should catch the eye. */
const BUCKET_TONE: Record<AgedBucketKey, string> = {
  current: "text-muted",
  d1_30: "text-foreground",
  d31_60: "text-amber-700 dark:text-amber-400",
  d61_90: "text-orange-700 dark:text-orange-400",
  d90_plus: "text-red-700 dark:text-red-400 font-semibold",
};

export default function AgedDebtorsPage() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery<AgedResponse>({
    queryKey: ["billing", "aged-debtors"],
    queryFn: () => fetchApi("/api/billing/aged-debtors"),
    retry: 2,
  });

  const buckets = data?.buckets ?? [];
  const families = data?.families ?? [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Aged debtors"
        description="Outstanding invoices by age, oldest first. Calculated from issued invoices — drafts aren't counted."
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (
        <>
          {/* Totals across every bucket */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {buckets.map((b) => (
              <div
                key={b.key}
                className="bg-card rounded-xl border border-border p-4"
              >
                <p className="text-xs text-muted uppercase tracking-wide">
                  {b.label}
                </p>
                <p className={`text-lg mt-1 ${BUCKET_TONE[b.key]}`}>
                  {formatMoney(data?.totals[b.key] ?? 0)}
                </p>
              </div>
            ))}
            <div className="bg-brand/5 rounded-xl border border-brand/30 p-4">
              <p className="text-xs text-brand uppercase tracking-wide font-medium">
                Total owing
              </p>
              <p className="text-lg mt-1 font-semibold text-brand">
                {formatMoney(data?.totals.total ?? 0)}
              </p>
            </div>
          </div>

          {families.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="Nothing outstanding"
              description="No issued invoice currently has a balance owing."
            />
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface/60 border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide">
                        Family
                      </th>
                      {buckets.map((b) => (
                        <th
                          key={b.key}
                          className="text-right px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide whitespace-nowrap"
                        >
                          {b.label}
                        </th>
                      ))}
                      <th className="text-right px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide">
                        Total
                      </th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {families.map((f) => (
                      // Fragment carries the key — a bare <> can't, and
                      // React warns on every render without it.
                      <Fragment key={f.contactId || f.name}>
                        <tr className="hover:bg-surface/40">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">
                              {f.name}
                            </p>
                            <p className="text-xs text-muted">
                              {[
                                f.serviceName,
                                f.oldestDays > 0
                                  ? `${f.oldestDays} days overdue`
                                  : "Not yet due",
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </td>
                          {buckets.map((b) => (
                            <td
                              key={b.key}
                              className={`px-4 py-3 text-right whitespace-nowrap ${
                                f.totals[b.key] > 0
                                  ? BUCKET_TONE[b.key]
                                  : "text-muted/40"
                              }`}
                            >
                              {f.totals[b.key] > 0
                                ? formatMoney(f.totals[b.key])
                                : "—"}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right font-semibold text-foreground whitespace-nowrap">
                            {formatMoney(f.totals.total)}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {f.email && (
                              <a
                                href={`mailto:${f.email}`}
                                aria-label={`Email ${f.name}`}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted hover:text-brand hover:bg-surface"
                              >
                                <Mail className="w-4 h-4" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setExpanded(
                                  expanded === f.contactId ? null : f.contactId,
                                )
                              }
                              aria-label={`Show invoices for ${f.name}`}
                              aria-expanded={expanded === f.contactId}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted hover:text-brand hover:bg-surface"
                            >
                              <ChevronDown
                                className={`w-4 h-4 transition-transform ${
                                  expanded === f.contactId ? "rotate-180" : ""
                                }`}
                              />
                            </button>
                          </td>
                        </tr>
                        {expanded === f.contactId && (
                          <tr>
                            <td
                              colSpan={buckets.length + 3}
                              className="px-4 py-3 bg-surface/40"
                            >
                              <ul className="space-y-1.5">
                                {f.statements.map((s) => (
                                  <li
                                    key={s.id}
                                    className="flex items-center gap-3 text-xs"
                                  >
                                    <Link
                                      href={`/billing/statements?id=${s.id}`}
                                      className="text-brand hover:underline"
                                    >
                                      Invoice {s.id.slice(-6)}
                                    </Link>
                                    <span className="text-muted">
                                      {s.dueDate
                                        ? `due ${s.dueDate.slice(0, 10)}`
                                        : "no due date"}
                                    </span>
                                    <span
                                      className={`ml-auto ${BUCKET_TONE[s.bucket]}`}
                                    >
                                      {formatMoney(s.balanceCents)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

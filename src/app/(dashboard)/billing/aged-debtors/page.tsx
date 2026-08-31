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
import { AlertTriangle, ChevronDown, Mail, Search } from "lucide-react";
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
  phone: string | null;
  serviceId: string | null;
  serviceName: string | null;
  lastContactedAt: string | null;
  lastContactMethod: string | null;
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

/** How long a family can sit unchased before it's worth surfacing. */
const STALE_CONTACT_DAYS = 14;

export default function AgedDebtorsPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [minOwing, setMinOwing] = useState("");
  const [contactFilter, setContactFilter] = useState<
    "" | "never" | "stale" | "recent"
  >("");

  const { data, isLoading } = useQuery<AgedResponse>({
    queryKey: ["billing", "aged-debtors"],
    queryFn: () => fetchApi("/api/billing/aged-debtors"),
    retry: 2,
  });

  const buckets = data?.buckets ?? [];
  const allFamilies = data?.families ?? [];

  // Every school on the list, so the filter offers only centres that
  // actually owe money rather than the whole network.
  // Plain derivations, not useMemo: the React Compiler handles this, and
  // a hand-rolled dep array on a freshly-built array defeats it.
  const services = [
    ...new Set(allFamilies.map((f) => f.serviceName).filter(Boolean)),
  ].sort() as string[];

  const families = (() => {
    const q = search.trim().toLowerCase();
    const min = Number(minOwing);
    const minCents =
      minOwing.trim() !== "" && Number.isFinite(min) ? Math.round(min * 100) : null;
    // The server's as-of time, not Date.now(): it keeps this derivation
    // pure, and it's the same clock the ageing buckets were computed on.
    const asOfMs = data?.asOf ? new Date(data.asOf).getTime() : 0;
    const staleBefore = asOfMs - STALE_CONTACT_DAYS * 86400_000;

    return allFamilies.filter((f) => {
      if (q) {
        // Name, email or phone — whatever the person on the phone has
        // to hand.
        const hay = [f.name, f.email, f.phone, f.serviceName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (serviceFilter && f.serviceName !== serviceFilter) return false;
      if (minCents != null && f.totals.total < minCents) return false;
      if (contactFilter === "never" && f.lastContactedAt) return false;
      if (contactFilter === "stale") {
        // Never contacted counts as stale — it's the worst case of it.
        if (f.lastContactedAt && new Date(f.lastContactedAt).getTime() > staleBefore) {
          return false;
        }
      }
      if (contactFilter === "recent") {
        if (!f.lastContactedAt) return false;
        if (new Date(f.lastContactedAt).getTime() <= staleBefore) return false;
      }
      return true;
    });
  })();

  const filtering =
    search.trim() !== "" ||
    serviceFilter !== "" ||
    minOwing.trim() !== "" ||
    contactFilter !== "";

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

          {/* Find one family, or narrow to the ones worth ringing today. */}
          <div className="bg-card rounded-xl border border-border p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label htmlFor="ad-search" className="sr-only">
                  Search families
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    id="ad-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name, email, phone or school"
                    className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="ad-school" className="sr-only">
                  School
                </label>
                <select
                  id="ad-school"
                  value={serviceFilter}
                  onChange={(e) => setServiceFilter(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                >
                  <option value="">Every school</option>
                  {services.map((sName) => (
                    <option key={sName} value={sName}>
                      {sName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ad-min" className="sr-only">
                  Owing at least
                </label>
                <input
                  id="ad-min"
                  inputMode="decimal"
                  value={minOwing}
                  onChange={(e) => setMinOwing(e.target.value)}
                  placeholder="Owing at least $"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ["", "Everyone"],
                  ["never", "Never contacted"],
                  ["stale", `Not chased in ${STALE_CONTACT_DAYS} days`],
                  ["recent", "Chased recently"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value || "all"}
                  type="button"
                  onClick={() => setContactFilter(value)}
                  className={
                    "min-h-9 rounded-lg px-3 text-xs font-medium transition-colors " +
                    (contactFilter === value
                      ? "bg-brand text-white"
                      : "border border-border text-muted hover:bg-surface")
                  }
                >
                  {label}
                </button>
              ))}
              {filtering && (
                <span className="ml-auto text-xs text-muted">
                  {families.length} of {allFamilies.length} families
                </span>
              )}
            </div>
          </div>

          {families.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title={filtering ? "No families match" : "Nothing outstanding"}
              description={
                filtering
                  ? "Try a different search, or clear the filters."
                  : "No issued invoice currently has a balance owing."
              }
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
                            {/* Whether anyone has actually rung them.
                                "Never" is the one worth seeing. */}
                            <p
                              className={
                                "text-xs " +
                                (f.lastContactedAt
                                  ? "text-muted"
                                  : "text-amber-700 dark:text-amber-400")
                              }
                            >
                              {f.lastContactedAt
                                ? `Last chased ${new Date(
                                    f.lastContactedAt,
                                  ).toLocaleDateString("en-AU", {
                                    day: "numeric",
                                    month: "short",
                                  })}${
                                    f.lastContactMethod
                                      ? ` by ${f.lastContactMethod.replace("_", " ")}`
                                      : ""
                                  }`
                                : "Never contacted"}
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

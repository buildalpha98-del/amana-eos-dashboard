"use client";

/**
 * /families/[id] — one family.
 *
 * 2026-07-31, per Daniel: click a family to see their bank details, their
 * billing arrangement, and links through to each child.
 *
 * Bank details are shown MASKED. The full number is encrypted and only
 * released by /api/enrolments/[id]/payment, which is owner/head_office
 * only — this page is open to admin as well, so it deliberately doesn't
 * become a side door around that restriction.
 */

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CreditCard,
  Landmark,
  Loader2,
  Mail,
  ChevronRight,
  CalendarClock,
} from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  BILLING_FREQUENCIES,
  anchorDayRange,
  describeBilling,
  formatCents,
  parseDollarsToCents,
  WEEKDAY_NAMES,
} from "@/lib/family-billing";

interface FamilyChild {
  id: string;
  name: string;
  status: string;
  dob: string | null;
  schoolName: string | null;
  classroom: string | null;
  ccsStatus: string | null;
  serviceName: string | null;
}

interface FamilyDetail {
  id: string;
  email: string;
  familyName: string | null;
  contactName: string | null;
  emailVerified: boolean;
  enrolmentState: string;
  billing: {
    frequency: string | null;
    anchorDay: number | null;
    limitCents: number | null;
    notes: string | null;
  };
  payment: {
    method: string | null;
    lastFour: string | null;
    cardType: string | null;
    bsbLastThree: string | null;
    accountLastFour: string | null;
    hasEncryptedDetails: boolean;
    enrolmentId: string | null;
  } | null;
  children: FamilyChild[];
}

const field =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand";

export default function FamilyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<FamilyDetail>({
    queryKey: ["families", id],
    queryFn: () => fetchApi<FamilyDetail>(`/api/families/${id}`),
    retry: 2,
  });

  // Overlay rather than hydrate — same reason as the enrolment wizard: a
  // slow refetch must not clobber what staff are mid-way through typing.
  const [edits, setEdits] = useState<Record<string, unknown> | null>(null);
  const [limitInput, setLimitInput] = useState<string | null>(null);
  const [familyNameInput, setFamilyNameInput] = useState<string | null>(null);
  const familyNameValue = familyNameInput ?? data?.familyName ?? "";

  const billing = {
    frequency: data?.billing.frequency ?? null,
    anchorDay: data?.billing.anchorDay ?? null,
    limitCents: data?.billing.limitCents ?? null,
    notes: data?.billing.notes ?? null,
    ...(edits ?? {}),
  } as {
    frequency: string | null;
    anchorDay: number | null;
    limitCents: number | null;
    notes: string | null;
  };

  const limitValue =
    limitInput ??
    (billing.limitCents !== null ? (billing.limitCents / 100).toFixed(2) : "");

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi(`/api/families/${id}`, { method: "PATCH", body }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["families"] });
      setEdits(null);
      setLimitInput(null);
      toast({ description: "Billing arrangement saved." });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const saveName = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi(`/api/families/${id}`, { method: "PATCH", body }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["families"] });
      setFamilyNameInput(null);
      toast({ description: "Family name saved." });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const handleSave = () => {
    const cents = parseDollarsToCents(limitValue);
    if (cents === undefined) {
      // Not the same as "no limit" — a typo must not silently remove a cap
      // staff set on purpose.
      toast({
        variant: "destructive",
        description: "Enter the billing limit as a dollar amount, e.g. 250 or 250.00.",
      });
      return;
    }
    save.mutate({
      billingFrequency: billing.frequency,
      billingAnchorDay: billing.anchorDay,
      billingLimitCents: cents,
      billingNotes: billing.notes,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted">Family not found.</p>;
  }

  const range = anchorDayRange(billing.frequency);
  const dirty = edits !== null || limitInput !== null;

  return (
    <div className="space-y-6">
      <Link
        href="/families"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
      >
        <ArrowLeft className="w-4 h-4" /> All families
      </Link>

      <PageHeader
        title={
          data.familyName ? `The ${data.familyName} family` : "Family account"
        }
        description={data.contactName ?? data.email}
      />

      {/* ── Contact ─────────────────────────────────────────── */}
      <section className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">Account</h2>

        {/* Editable: the name is seeded from the primary carer's surname,
            which is right most of the time and wrong often enough that
            staff need the last word. */}
        <div className="mb-4 max-w-sm">
          <label
            htmlFor="f-name"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Family name
          </label>
          <div className="flex gap-2">
            <input
              id="f-name"
              className={field}
              value={familyNameValue}
              onChange={(e) => setFamilyNameInput(e.target.value)}
              placeholder="e.g. Rahman"
            />
            <Button
              variant="outline"
              onClick={() =>
                saveName.mutate({ familyName: familyNameValue.trim() || null })
              }
              disabled={
                saveName.isPending ||
                familyNameInput === null ||
                familyNameValue.trim() === (data.familyName ?? "")
              }
            >
              {saveName.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-muted text-xs uppercase tracking-wide">Email</dt>
            <dd className="text-foreground mt-0.5 flex items-center gap-1.5 break-all">
              <Mail className="w-3.5 h-3.5 shrink-0 text-muted" />
              {data.email}
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs uppercase tracking-wide">
              Email verified
            </dt>
            <dd className="text-foreground mt-0.5">
              {data.emailVerified ? "Yes" : "Not yet"}
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs uppercase tracking-wide">
              Enrolment
            </dt>
            <dd className="text-foreground mt-0.5 capitalize">
              {data.enrolmentState.replace(/_/g, " ")}
            </dd>
          </div>
        </dl>
      </section>

      {/* ── Children ────────────────────────────────────────── */}
      <section className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">
          Children ({data.children.length})
        </h2>
        {data.children.length === 0 ? (
          <p className="text-sm text-muted">
            No children yet — this family hasn&apos;t submitted an enrolment.
          </p>
        ) : (
          <ul className="divide-y divide-border -mx-5">
            {data.children.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/children/${c.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-surface transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {c.name}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {[
                        c.serviceName,
                        c.schoolName,
                        c.classroom,
                        c.ccsStatus ? `CCS: ${c.ccsStatus}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No details yet"}
                    </p>
                  </div>
                  <span
                    className={
                      "text-2xs px-2 py-0.5 rounded-full shrink-0 " +
                      (c.status === "active"
                        ? "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200")
                    }
                  >
                    {c.status}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted mt-3">
          Open a child to update their recurring bookings, CCS details or
          personal information.
        </p>
      </section>

      {/* ── Payment method ──────────────────────────────────── */}
      <section className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">
          Payment method
        </h2>
        {!data.payment ? (
          <p className="text-sm text-muted">
            No payment details on file yet.
          </p>
        ) : (
          <div className="flex items-start gap-3">
            {data.payment.method === "bank_account" ? (
              <Landmark className="w-5 h-5 text-brand mt-0.5 shrink-0" />
            ) : (
              <CreditCard className="w-5 h-5 text-brand mt-0.5 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm text-foreground">
                {data.payment.method === "bank_account"
                  ? `Direct debit — BSB •••${data.payment.bsbLastThree ?? "•••"}, account ••••${data.payment.accountLastFour ?? "••••"}`
                  : `${data.payment.cardType ?? "Card"} ending ${data.payment.lastFour ?? "••••"}`}
              </p>
              <p className="text-xs text-muted mt-1">
                Shown masked. {data.payment.hasEncryptedDetails
                  ? "The full details are encrypted and can be retrieved by an owner or state manager for OWNA porting."
                  : "No encrypted copy is stored for this enrolment."}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── Billing arrangement ─────────────────────────────── */}
      <section className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-sm font-semibold text-foreground">
            Billing arrangement
          </h2>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted shrink-0">
            <CalendarClock className="w-3.5 h-3.5" />
            {describeBilling({
              billingFrequency: billing.frequency,
              billingAnchorDay: billing.anchorDay,
              billingLimitCents: billing.limitCents,
            })}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div>
            <label
              htmlFor="fb-freq"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Cycle
            </label>
            <select
              id="fb-freq"
              className={field}
              value={billing.frequency ?? ""}
              onChange={(e) => {
                const frequency = e.target.value || null;
                // Clear the day when the cycle changes: "day 28" means
                // something entirely different weekly vs monthly, and
                // carrying it over would silently set a wrong date.
                setEdits((prev) => ({
                  ...(prev ?? {}),
                  frequency,
                  anchorDay: null,
                }));
              }}
            >
              <option value="">Not set</option>
              {BILLING_FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="fb-day"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Billing day
            </label>
            {billing.frequency === "monthly" ? (
              <select
                id="fb-day"
                className={field}
                value={billing.anchorDay ?? ""}
                onChange={(e) =>
                  setEdits((prev) => ({
                    ...(prev ?? {}),
                    anchorDay: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              >
                <option value="">Not set</option>
                {Array.from({ length: range.max }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    Day {d}
                  </option>
                ))}
              </select>
            ) : (
              <select
                id="fb-day"
                className={field}
                disabled={!billing.frequency}
                value={billing.anchorDay ?? ""}
                onChange={(e) =>
                  setEdits((prev) => ({
                    ...(prev ?? {}),
                    anchorDay: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              >
                <option value="">Not set</option>
                {WEEKDAY_NAMES.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            {billing.frequency === "monthly" && (
              <p className="mt-1 text-xs text-muted">
                Capped at 28 so the date exists in February too.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="fb-limit"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Billing limit
            </label>
            <input
              id="fb-limit"
              className={field}
              inputMode="decimal"
              placeholder="No limit"
              value={limitValue}
              onChange={(e) => setLimitInput(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted">
              Maximum per debit. Leave blank for no cap.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <label
            htmlFor="fb-notes"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Notes
          </label>
          <textarea
            id="fb-notes"
            rows={2}
            className={field}
            value={billing.notes ?? ""}
            onChange={(e) =>
              setEdits((prev) => ({ ...(prev ?? {}), notes: e.target.value }))
            }
            placeholder="Anything the finance team should know about this family's billing."
          />
        </div>

        <div className="flex items-center gap-3 mt-4">
          <Button onClick={handleSave} disabled={!dirty || save.isPending}>
            {save.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Saving…
              </>
            ) : (
              "Save billing"
            )}
          </Button>
          {dirty && (
            <button
              type="button"
              onClick={() => {
                setEdits(null);
                setLimitInput(null);
              }}
              className="text-sm text-muted hover:text-foreground"
            >
              Discard changes
            </button>
          )}
          {!dirty && billing.limitCents !== null && (
            <span className="text-xs text-muted">
              Current cap {formatCents(billing.limitCents)}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

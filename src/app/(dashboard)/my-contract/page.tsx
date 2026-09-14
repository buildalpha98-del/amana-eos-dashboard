"use client";

/**
 * /my-contract — the staff member's own employment contracts.
 *
 * Added 2026-09-14. Until now the only way a staff member could read their
 * own contract was to scroll to the fifth card on /my-portal and find a
 * "View Contract" button, and that card only rendered for a contract in
 * `active` status — so anyone whose contract was still a draft saw nothing
 * at all and reasonably concluded the app didn't have it.
 *
 * This page is the addressable home for that: current contract, full
 * history, and an honest explanation when there's nothing to show yet.
 * It's linked from the sidebar (so it appears in the mobile More drawer)
 * and from the /my-portal card, and it accepts `?contract=<id>` to open a
 * specific contract directly — which is what the issue email sends.
 */

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Hourglass,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchApi } from "@/lib/fetch-api";
import {
  ContractViewerModal,
  type ContractViewerContract,
} from "@/components/my-portal/ContractViewerModal";

interface MyContract {
  id: string;
  contractType: string;
  awardLevel: string | null;
  awardLevelCustom: string | null;
  classification: string | null;
  payRate: number;
  hoursPerWeek: number | null;
  startDate: string;
  endDate: string | null;
  status: "active" | "superseded" | "terminated";
  acknowledgedByStaff: boolean;
  acknowledgedAt: string | null;
  templateId: string | null;
  hasDocument: boolean;
  createdAt: string;
}

interface MyContractsResponse {
  contracts: MyContract[];
  hasPendingDraft: boolean;
}

function formatContractType(type: string): string {
  return type
    .replace(/^ct_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toViewerContract(c: MyContract): ContractViewerContract {
  return {
    id: c.id,
    contractType: c.contractType,
    startDate: c.startDate,
    endDate: c.endDate,
    isTemplateBased: !!c.templateId,
    hasDocument: c.hasDocument,
    acknowledged: c.acknowledgedByStaff,
    acknowledgedAt: c.acknowledgedAt,
    // Only a current, unsigned contract can be signed. History is read-only.
    canAcknowledge: c.status === "active" && !c.acknowledgedByStaff,
  };
}

function MyContractContent() {
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("contract");

  const { data, isLoading, error } = useQuery<MyContractsResponse>({
    queryKey: ["my-contracts"],
    queryFn: () => fetchApi<MyContractsResponse>("/api/my-portal/contracts"),
    retry: 2,
  });

  const [viewing, setViewing] = useState<ContractViewerContract | null>(null);

  // Deep link from the contract-issued email: /my-contract?contract=<id>.
  //
  // Derived during render rather than pushed into state from an effect, so
  // there's no cascading render and no "opened once" bookkeeping. Closing
  // the modal sets `deepLinkDismissed`, which is what stops the derived
  // value from immediately re-opening it.
  const [deepLinkDismissed, setDeepLinkDismissed] = useState(false);
  const deepLinked =
    requestedId && !deepLinkDismissed
      ? data?.contracts.find((c) => c.id === requestedId)
      : undefined;
  const shownContract =
    viewing ?? (deepLinked ? toViewerContract(deepLinked) : null);

  function closeViewer() {
    setViewing(null);
    setDeepLinkDismissed(true);
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <p className="text-sm text-foreground">
          We couldn&apos;t load your contracts just now. Please refresh, and
          let your Director know if it keeps happening.
        </p>
      </div>
    );
  }

  const contracts = data?.contracts ?? [];
  const current = contracts.find((c) => c.status === "active") ?? null;
  const past = contracts.filter((c) => c.id !== current?.id);

  return (
    <>
      {/* ── Current contract ─────────────────────────────────────── */}
      {current ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand" />
                Your current contract
              </h2>
              <p className="text-sm text-muted mt-0.5">
                {formatContractType(current.contractType)}
                {current.classification ? ` · ${current.classification}` : ""}
              </p>
            </div>
            {current.acknowledgedByStaff ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Signed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">
                <AlertTriangle className="w-3.5 h-3.5" />
                Signature needed
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            <div>
              <p className="text-xs text-muted mb-0.5">Pay rate</p>
              <p className="text-sm font-medium text-foreground">
                ${current.payRate.toFixed(2)}/hr
              </p>
            </div>
            <div>
              <p className="text-xs text-muted mb-0.5">Hours / week</p>
              <p className="text-sm font-medium text-foreground">
                {current.hoursPerWeek ? `${current.hoursPerWeek}h` : "Variable"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted mb-0.5">Start date</p>
              <p className="text-sm font-medium text-foreground">
                {formatDate(current.startDate)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted mb-0.5">End date</p>
              <p className="text-sm font-medium text-foreground">
                {current.endDate ? formatDate(current.endDate) : "Ongoing"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setViewing(toViewerContract(current))}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              current.acknowledgedByStaff
                ? "bg-surface text-foreground border border-border hover:bg-surface/70"
                : "bg-brand text-white hover:bg-brand-hover"
            }`}
            data-testid="my-contract-view"
          >
            <FileText className="w-4 h-4" />
            {current.acknowledgedByStaff
              ? "Read your contract"
              : "Read & sign your contract"}
          </button>
        </div>
      ) : data?.hasPendingDraft ? (
        // A draft exists but hasn't been issued. Saying so beats an empty
        // state that reads as "we have no contract for you".
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Hourglass className="w-8 h-8 text-brand mx-auto mb-3" />
          <h2 className="text-base font-semibold text-foreground mb-1">
            Your contract is being prepared
          </h2>
          <p className="text-sm text-muted max-w-md mx-auto">
            Your centre has started your contract but hasn&apos;t issued it
            yet. You&apos;ll get an email the moment it&apos;s ready to read
            and sign.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <FileText className="w-8 h-8 text-muted mx-auto mb-3" />
          <h2 className="text-base font-semibold text-foreground mb-1">
            No contract on file yet
          </h2>
          <p className="text-sm text-muted max-w-md mx-auto">
            We don&apos;t have an employment contract recorded for you. If you
            believe this is wrong, please speak with your Director of Service
            or the office.
          </p>
        </div>
      )}

      {/* ── History ──────────────────────────────────────────────── */}
      {past.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-muted" />
            Previous contracts
            <span className="text-xs font-normal text-muted">
              ({past.length})
            </span>
          </h2>
          <div className="divide-y divide-border">
            {past.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {formatContractType(c.contractType)}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDate(c.startDate)}
                    {c.endDate ? ` – ${formatDate(c.endDate)}` : ""}
                    {" · "}
                    {c.status === "superseded" ? "Replaced" : "Ended"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewing(toViewerContract(c))}
                  className="text-sm text-brand hover:underline shrink-0"
                >
                  View
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted text-center">
        Questions about your pay rate or hours? Speak with your Director of
        Service, or see{" "}
        <Link href="/my-pay" className="text-brand hover:underline">
          My Pay
        </Link>
        .
      </p>

      {shownContract && (
        <ContractViewerModal contract={shownContract} onClose={closeViewer} />
      )}
    </>
  );
}

export default function MyContractPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="My Contract"
        description="Read, sign and download your employment contract"
      />
      {/* useSearchParams needs a Suspense boundary for the ?contract= deep
          link not to opt the whole route out of static rendering. */}
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        }
      >
        <MyContractContent />
      </Suspense>
    </div>
  );
}

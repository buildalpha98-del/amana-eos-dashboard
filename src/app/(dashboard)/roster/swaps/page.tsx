"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { isAdminRole } from "@/lib/role-permissions";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

interface SwapItem {
  id: string;
  shiftId: string;
  proposerId: string;
  targetId: string;
  status: "proposed" | "accepted" | "approved" | "rejected" | "cancelled";
  reason: string | null;
  rejectedReason?: string | null;
  createdAt: string;
  acceptedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  shift: {
    id: string;
    date: string;
    shiftStart: string;
    shiftEnd: string;
    sessionType: string;
    serviceId: string;
  } | null;
  proposer: { id: string; name: string } | null;
  target: { id: string; name: string } | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: SwapItem["status"] }) {
  const styles: Record<SwapItem["status"], string> = {
    proposed: "bg-amber-100 text-amber-900",
    accepted: "bg-blue-100 text-blue-900",
    approved: "bg-green-100 text-green-900",
    rejected: "bg-red-100 text-red-900",
    cancelled: "bg-gray-100 text-gray-700",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export default function SwapsInboxPage() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();

  const role = session?.user?.role ?? "";
  const sessionServiceId = (session?.user as { serviceId?: string | null } | undefined)?.serviceId ?? null;
  const isAdmin = isAdminRole(role);
  const isCoord = role === "coordinator";
  const canApprove = isAdmin || isCoord;

  // Staff see their own swaps; admins/coords see service-scoped swaps.
  const scope = canApprove ? "service" : "mine";

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ swaps: SwapItem[] }>({
    queryKey: ["shift-swaps", scope],
    queryFn: () => fetchApi<{ swaps: SwapItem[] }>(`/api/shift-swaps?scope=${scope}`),
    enabled: status === "authenticated",
    retry: 2,
    staleTime: 30_000,
  });

  // Mutations for each action. `toast({ variant: "destructive" })` on error
  // per CLAUDE.md. React Query cache is invalidated on success.
  function mutationOptionsFor(
    endpoint: "accept" | "reject" | "approve" | "cancel",
  ) {
    return {
      mutationFn: (swapId: string) =>
        mutateApi(`/api/shift-swaps/${swapId}/${endpoint}`, {
          method: "POST" as const,
          body: endpoint === "reject" ? {} : undefined,
        }),
      onSuccess: () => {
        toast({ description: `Swap ${endpoint}ed.` });
        queryClient.invalidateQueries({ queryKey: ["shift-swaps"] });
        void refetch();
      },
      onError: (err: Error) => {
        toast({
          variant: "destructive",
          description: err.message || "Something went wrong",
        });
      },
    };
  }

  const acceptMut = useMutation(mutationOptionsFor("accept"));
  const rejectMut = useMutation(mutationOptionsFor("reject"));
  const approveMut = useMutation(mutationOptionsFor("approve"));
  const cancelMut = useMutation(mutationOptionsFor("cancel"));

  // Memoise so `data?.swaps ?? []` isn't a fresh reference each render —
  // that reference is the `swaps` array every downstream useMemo reads.
  const swaps = useMemo(() => data?.swaps ?? [], [data?.swaps]);

  // Buckets — render consistently whether or not they're empty.
  const pendingReview = useMemo(() => {
    if (!canApprove) return [];
    return swaps.filter((s) => {
      if (s.status !== "accepted") return false;
      if (isAdmin) return true;
      return s.shift?.serviceId === sessionServiceId;
    });
  }, [swaps, canApprove, isAdmin, sessionServiceId]);

  const myProposals = useMemo(
    () =>
      swaps.filter(
        (s) => s.proposerId === session?.user?.id && s.status === "proposed",
      ),
    [swaps, session?.user?.id],
  );

  const history = useMemo(
    () =>
      swaps.filter(
        (s) =>
          !(s.status === "accepted" && canApprove) &&
          !(s.proposerId === session?.user?.id && s.status === "proposed"),
      ),
    [swaps, canApprove, session?.user?.id],
  );

  if (status === "loading") {
    return (
      <div className="p-6 md:p-10 space-y-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 space-y-6">
      <div>
        <h1 className="text-xl font-heading font-semibold text-foreground tracking-tight">
          Shift swap requests
        </h1>
        <p className="text-sm text-muted mt-1">
          {canApprove
            ? "Review, approve, or reject swaps for your service."
            : "Track the status of your proposed swaps."}
        </p>
      </div>

      {error ? <ErrorState error={error} /> : null}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {canApprove ? (
            <SwapSection
              title="Pending my review"
              emptyLabel="No swaps awaiting your approval."
              testid="swaps-pending-review"
            >
              {pendingReview.map((swap) => (
                <SwapRow key={swap.id} swap={swap}>
                  <button
                    type="button"
                    onClick={() => approveMut.mutate(swap.id)}
                    disabled={approveMut.isPending}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-brand text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => rejectMut.mutate(swap.id)}
                    disabled={rejectMut.isPending}
                    className="px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-surface disabled:opacity-50"
                  >
                    Reject
                  </button>
                </SwapRow>
              ))}
            </SwapSection>
          ) : null}

          <SwapSection
            title="My proposals"
            emptyLabel="You haven't proposed any swaps."
            testid="swaps-my-proposals"
          >
            {myProposals.map((swap) => (
              <SwapRow key={swap.id} swap={swap}>
                <button
                  type="button"
                  onClick={() => cancelMut.mutate(swap.id)}
                  disabled={cancelMut.isPending}
                  className="px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-surface disabled:opacity-50"
                >
                  Cancel
                </button>
              </SwapRow>
            ))}
          </SwapSection>

          <SwapSection
            title="History"
            emptyLabel="No past swaps."
            testid="swaps-history"
          >
            {history.map((swap) => (
              <SwapRow key={swap.id} swap={swap}>
                {/* History rows show status only — any available target actions */}
                {swap.status === "proposed" && swap.targetId === session?.user?.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => acceptMut.mutate(swap.id)}
                      disabled={acceptMut.isPending}
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-brand text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectMut.mutate(swap.id)}
                      disabled={rejectMut.isPending}
                      className="px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-surface disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                ) : null}
              </SwapRow>
            ))}
          </SwapSection>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Presentational helpers
// ---------------------------------------------------------------------------

function SwapSection({
  title,
  emptyLabel,
  testid,
  children,
}: {
  title: string;
  emptyLabel: string;
  testid: string;
  children: React.ReactNode;
}) {
  const childArray = Array.isArray(children) ? children : [children];
  const isEmpty = childArray.filter(Boolean).length === 0;
  return (
    <section
      className="rounded-xl border border-border bg-card p-5 space-y-3"
      data-testid={testid}
    >
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {isEmpty ? (
        <p className="text-sm text-muted">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-border/40">{children}</ul>
      )}
    </section>
  );
}

function SwapRow({
  swap,
  children,
}: {
  swap: SwapItem;
  children: React.ReactNode;
}) {
  return (
    <li
      className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
      data-testid={`swap-row-${swap.id}`}
    >
      <div className="flex flex-col flex-1 min-w-[220px]">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <strong>{swap.proposer?.name ?? "Unknown"}</strong>
          <span className="text-muted">→</span>
          <strong>{swap.target?.name ?? "Unknown"}</strong>
          <StatusBadge status={swap.status} />
        </div>
        <div className="text-xs text-muted">
          {swap.shift
            ? `${formatDate(swap.shift.date)} · ${swap.shift.shiftStart}–${swap.shift.shiftEnd}`
            : "—"}
        </div>
        {swap.reason ? (
          <div className="text-xs text-muted mt-0.5">Reason: {swap.reason}</div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </li>
  );
}

"use client";

/**
 * /waitlist — manage the queue of families waiting for a place.
 *
 * The API for this (list, reorder, offer, expiry cron) already existed;
 * there was simply no page, so the waitlist was invisible and families
 * sat on it unmanaged. This is the missing surface.
 *
 * A waitlist entry is a ParentEnquiry at stage "waitlisted" — not a
 * separate record — so a family keeps one identity from first enquiry
 * through to enrolment.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronUp,
  ChevronDown,
  Clock,
  Loader2,
  Mail,
  Phone,
  Send,
  Users,
} from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

interface WaitlistEntry {
  id: string;
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  childName: string | null;
  waitlistPosition: number | null;
  waitlistJoinedAt: string | null;
  waitlistOfferedAt: string | null;
  waitlistExpiresAt: string | null;
  serviceName: string | null;
  daysWaiting: number;
}

interface ServiceOption {
  id: string;
  name: string;
}

type StatusFilter = "all" | "waiting" | "offered";

/** Hours left on an offer, or null when there's no live offer. */
function hoursLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.floor(ms / (1000 * 60 * 60));
}

export default function WaitlistPage() {
  const qc = useQueryClient();
  const [serviceId, setServiceId] = useState<string>("");
  const [status, setStatus] = useState<StatusFilter>("all");

  // /api/services returns a BARE ARRAY when unpaginated, not { services }.
  const { data: services } = useQuery<ServiceOption[]>({
    queryKey: ["services", "options"],
    queryFn: () => fetchApi("/api/services"),
    retry: 1,
  });

  const { data, isLoading } = useQuery<WaitlistEntry[]>({
    queryKey: ["waitlist", { serviceId, status }],
    queryFn: () =>
      fetchApi(
        `/api/waitlist?status=${status}` +
          (serviceId ? `&serviceId=${encodeURIComponent(serviceId)}` : ""),
      ),
    retry: 2,
  });

  const entries = useMemo(() => data ?? [], [data]);

  const reorder = useMutation({
    mutationFn: (body: { serviceId: string; orderedIds: string[] }) =>
      mutateApi("/api/waitlist/reorder", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["waitlist"] }),
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  const offerSpot = useMutation({
    mutationFn: (body: { serviceId: string }) =>
      mutateApi("/api/waitlist/offer-spot", { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["waitlist"] });
      toast({ description: "Spot offered to the next family on the list." });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  /**
   * Move an entry up or down.
   *
   * Reordering is only meaningful WITHIN one service's queue — position 3
   * at Coburg has nothing to do with position 3 at Springvale. So the
   * swap is computed against the neighbours at the same service, and the
   * controls are hidden unless a service is selected.
   */
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= entries.length) return;
    if (!serviceId) return;
    const ids = entries.map((e) => e.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate({ serviceId, orderedIds: ids });
  };

  const canReorder = Boolean(serviceId) && status !== "offered";

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Waitlist"
        description="Families waiting for a place, in order. Offers expire automatically if they aren't taken up."
      />

      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div>
          <label
            htmlFor="wl-service"
            className="block text-xs text-muted mb-1"
          >
            Service
          </label>
          <select
            id="wl-service"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="px-3 py-2 text-base sm:text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="">All services</option>
            {(services ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="wl-status" className="block text-xs text-muted mb-1">
            Status
          </label>
          <select
            id="wl-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="px-3 py-2 text-base sm:text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="all">All</option>
            <option value="waiting">Waiting</option>
            <option value="offered">Offered</option>
          </select>
        </div>

        <div className="sm:ml-auto">
          <Button
            onClick={() => {
              if (!serviceId) {
                // Offering blind across every service would hand the spot
                // to whoever happens to sort first, not to the family
                // actually next in line at the centre with the vacancy.
                toast({
                  variant: "destructive",
                  description:
                    "Choose a service first — a spot belongs to one centre's queue.",
                });
                return;
              }
              offerSpot.mutate({ serviceId });
            }}
            disabled={offerSpot.isPending}
          >
            {offerSpot.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Offering…</>
            ) : (
              <><Send className="w-4 h-4" /> Offer next spot</>
            )}
          </Button>
        </div>
      </div>

      {!canReorder && serviceId === "" && (
        <p className="text-xs text-muted">
          Select a service to reorder the queue — positions are per centre.
        </p>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nobody waiting"
          description="Families move here when an enquiry is set to the waitlist stage."
        />
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <ul className="divide-y divide-border">
            {entries.map((e, i) => {
              const hrs = hoursLeft(e.waitlistExpiresAt);
              const offered = Boolean(e.waitlistOfferedAt);
              return (
                <li
                  key={e.id}
                  className="flex items-start gap-3 px-4 py-3"
                >
                  <span className="w-7 h-7 shrink-0 rounded-full bg-surface border border-border flex items-center justify-center text-xs font-semibold text-muted">
                    {e.waitlistPosition ?? i + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {e.parentName ?? "Unnamed family"}
                      {e.childName && (
                        <span className="text-muted font-normal">
                          {" "}
                          · {e.childName}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {[
                        e.serviceName,
                        `waiting ${e.daysWaiting} ${e.daysWaiting === 1 ? "day" : "days"}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>

                    {offered && (
                      <p
                        className={
                          "inline-flex items-center gap-1 mt-1 text-2xs px-2 py-0.5 rounded-full " +
                          (hrs !== null && hrs < 0
                            ? "bg-surface text-muted"
                            : hrs !== null && hrs <= 24
                              ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200")
                        }
                      >
                        <Clock className="w-3 h-3" />
                        {hrs === null
                          ? "Offered"
                          : hrs < 0
                            ? "Offer expired"
                            : `Offer expires in ${hrs}h`}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {e.parentEmail && (
                      <a
                        href={`mailto:${e.parentEmail}`}
                        aria-label={`Email ${e.parentName ?? "family"}`}
                        className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-muted hover:text-brand hover:bg-surface"
                      >
                        <Mail className="w-4 h-4" />
                      </a>
                    )}
                    {e.parentPhone && (
                      <a
                        href={`tel:${e.parentPhone}`}
                        aria-label={`Call ${e.parentName ?? "family"}`}
                        className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-muted hover:text-brand hover:bg-surface"
                      >
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                    {canReorder && (
                      <>
                        <button
                          type="button"
                          onClick={() => move(i, -1)}
                          disabled={i === 0 || reorder.isPending}
                          aria-label="Move up"
                          className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-muted hover:text-brand hover:bg-surface disabled:opacity-30"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(i, 1)}
                          disabled={
                            i === entries.length - 1 || reorder.isPending
                          }
                          aria-label="Move down"
                          className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-muted hover:text-brand hover:bg-surface disabled:opacity-30"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

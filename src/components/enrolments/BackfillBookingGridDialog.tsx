"use client";

/**
 * Recover the session choices of families who enrolled through the portal
 * before the booking grid was translated.
 *
 * Their answers were stored in the grid's own words and read by nobody:
 * blank booking section on the enrolment pack, "Not set" on the centre's
 * children list, and no bookings at all when staff approved them. The
 * route that writes them is fixed; these are the ones already in the
 * database.
 *
 * Shows the proposals first, like the service matcher beside it. Nothing
 * here is a guess — the translation is exact — but a roll that changes
 * without warning is its own kind of problem.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CalendarCheck, CalendarOff } from "lucide-react";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

interface Proposal {
  childId: string;
  childName: string;
  enrolmentStatus: string | null;
  serviceId: string | null;
  bookingType: string | null;
  sessionTypes: string[];
  days: Record<string, string[]>;
  generatesBookings: boolean;
}

interface DryRun {
  proposals: Proposal[];
  summary: {
    total: number;
    generatingBookings: number;
    approved: number;
    awaitingService: number;
  };
}

const SESSION_LABELS: Record<string, string> = {
  bsc: "Before school",
  asc: "After school",
  vc: "Holiday Quest",
};

const DAY_SHORT: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};

/** "After school: Mon, Tue · Holiday Quest" — the family's actual answer. */
function describe(p: Proposal): string {
  return p.sessionTypes
    .map((st) => {
      const days = (p.days[st] ?? []).map((d) => DAY_SHORT[d] ?? d);
      const label = SESSION_LABELS[st] ?? st.toUpperCase();
      return days.length ? `${label}: ${days.join(", ")}` : label;
    })
    .join(" · ");
}

export function BackfillBookingGridDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [result, setResult] = useState<DryRun | null>(null);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const scan = useMutation({
    mutationFn: () =>
      mutateApi<DryRun>("/api/enrolments/backfill-booking-grid", {
        method: "POST",
        body: { apply: false },
      }),
    onSuccess: (data) => {
      setResult(data);
      setAccepted(data.proposals.map((p) => p.childId));
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const apply = useMutation({
    mutationFn: () =>
      mutateApi<{
        childrenRepaired: number;
        bookingsCreated: number;
      }>("/api/enrolments/backfill-booking-grid", {
        method: "POST",
        body: { apply: true, childIds: accepted },
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["enrolments"] });
      qc.invalidateQueries({ queryKey: ["children"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      setDone(
        `${data.childrenRepaired} ${
          data.childrenRepaired === 1 ? "child" : "children"
        } updated` +
          (data.bookingsCreated
            ? `, ${data.bookingsCreated} bookings created.`
            : "."),
      );
      setResult(null);
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const proposals = result?.proposals ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setResult(null);
          setDone(null);
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogTitle>Recover booking preferences</DialogTitle>
        <DialogDescription>
          Finds families who chose their sessions in the parent portal before
          those choices were readable here. Nothing is written until you apply
          it.
        </DialogDescription>

        <div className="mt-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {done && (
            <p className="text-sm text-foreground bg-green-50 dark:bg-green-950/40 rounded-lg p-3">
              {done}
            </p>
          )}

          {!result && !done && (
            <Button onClick={() => scan.mutate()} disabled={scan.isPending}>
              {scan.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Scanning…</>
              ) : (
                "Scan enrolments"
              )}
            </Button>
          )}

          {result && proposals.length === 0 && (
            <p className="text-sm text-muted">
              Every family&apos;s session choices are already readable. Nothing
              to do.
            </p>
          )}

          {proposals.length > 0 && (
            <>
              <p className="text-sm text-muted">
                {result!.summary.generatingBookings > 0 ? (
                  <>
                    <strong className="text-foreground">
                      {result!.summary.generatingBookings}
                    </strong>{" "}
                    of these will also generate the bookings their approval
                    never made — those children appear on the roll.
                  </>
                ) : (
                  "These will show on the enrolment pack and the centre's children list."
                )}
              </p>

              <div className="space-y-1">
                {proposals.map((p) => (
                  <label
                    key={p.childId}
                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-surface cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={accepted.includes(p.childId)}
                      onChange={() =>
                        setAccepted((prev) =>
                          prev.includes(p.childId)
                            ? prev.filter((x) => x !== p.childId)
                            : [...prev, p.childId],
                        )
                      }
                      className="mt-1 h-4 w-4 rounded border-border text-brand focus:ring-brand"
                    />
                    <span className="text-sm min-w-0">
                      <span className="text-foreground font-medium">
                        {p.childName}
                      </span>
                      <span className="block text-xs text-muted">
                        {describe(p)}
                        {p.bookingType === "casual" && " · casual"}
                        {!p.serviceId && " · no centre yet"}
                      </span>
                    </span>
                    {p.generatesBookings ? (
                      <CalendarCheck className="w-4 h-4 text-green-600 ml-auto shrink-0" />
                    ) : (
                      <CalendarOff className="w-4 h-4 text-muted ml-auto shrink-0" />
                    )}
                  </label>
                ))}
              </div>

              {result!.summary.awaitingService > 0 && (
                <p className="text-xs text-muted">
                  {result!.summary.awaitingService} of these aren&apos;t linked
                  to a centre yet, so no bookings can be made for them — use
                  &quot;Match to services&quot; for those.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {done ? "Close" : "Cancel"}
          </Button>
          {proposals.length > 0 && (
            <Button
              onClick={() => apply.mutate()}
              disabled={accepted.length === 0 || apply.isPending}
            >
              {apply.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Applying…</>
              ) : (
                `Update ${accepted.length}`
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

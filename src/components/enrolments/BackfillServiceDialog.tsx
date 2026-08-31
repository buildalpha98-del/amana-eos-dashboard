"use client";

/**
 * Match a backlog of unplaced enrolments to services in one pass.
 *
 * Always shows the proposals first. The matcher refuses ambiguous school
 * names on purpose, and a wrong match puts a child at a centre they don't
 * attend, so this is a review screen with an Apply button — not a job you
 * fire and hope about.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, AlertTriangle, HelpCircle } from "lucide-react";
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
  enrolmentId: string;
  childId: string;
  childName: string;
  familyName: string | null;
  schoolName: string | null;
  serviceId: string | null;
  serviceName: string | null;
  reason: "matched" | "ambiguous" | "no_match" | "no_school";
  enrolmentStatus: string;
}

interface DryRun {
  proposals: Proposal[];
  summary: {
    total: number;
    matched: number;
    ambiguous: number;
    noMatch: number;
    noSchool: number;
  };
}

const UNMATCHED_COPY: Record<string, string> = {
  ambiguous: "School name fits more than one centre",
  no_match: "No centre matched this school",
  no_school: "No school recorded on the enrolment",
};

export function BackfillServiceDialog({
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
      mutateApi<DryRun>("/api/enrolments/backfill-service", {
        method: "POST",
        body: { apply: false },
      }),
    onSuccess: (data) => {
      setResult(data);
      setAccepted(
        data.proposals.filter((p) => p.reason === "matched").map((p) => p.childId),
      );
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const apply = useMutation({
    mutationFn: () =>
      mutateApi<{ assigned: number; bookingsCreated: number }>(
        "/api/enrolments/backfill-service",
        { method: "POST", body: { apply: true, childIds: accepted } },
      ),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["enrolments"] });
      qc.invalidateQueries({ queryKey: ["children"] });
      qc.invalidateQueries({ queryKey: ["families"] });
      setDone(
        `${data.assigned} ${data.assigned === 1 ? "child" : "children"} placed` +
          (data.bookingsCreated
            ? `, ${data.bookingsCreated} bookings created.`
            : "."),
      );
      setResult(null);
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const matched = result?.proposals.filter((p) => p.reason === "matched") ?? [];
  const unmatched =
    result?.proposals.filter((p) => p.reason !== "matched") ?? [];

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
        <DialogTitle>Match enrolments to services</DialogTitle>
        <DialogDescription>
          Runs the school-name matcher over every child who isn&apos;t linked to
          a centre. Nothing is written until you apply it.
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
                "Scan unplaced enrolments"
              )}
            </Button>
          )}

          {result && result.summary.total === 0 && (
            <p className="text-sm text-muted">
              Every child is linked to a service. Nothing to do.
            </p>
          )}

          {matched.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                Ready to place ({matched.length})
              </h3>
              <div className="space-y-1">
                {matched.map((p) => (
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
                    <span className="text-sm">
                      <span className="text-foreground font-medium">
                        {p.childName}
                      </span>
                      <span className="block text-xs text-muted">
                        {p.schoolName} → {p.serviceName}
                      </span>
                    </span>
                    <Check className="w-4 h-4 text-green-600 ml-auto shrink-0" />
                  </label>
                ))}
              </div>
            </div>
          )}

          {unmatched.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                Needs you ({unmatched.length})
              </h3>
              {/*
                Listed, not hidden. These are the ones the matcher refused
                to guess at — leaving them off the screen is how a child
                stays on no roll for a term.
              */}
              <div className="space-y-1">
                {unmatched.map((p) => (
                  <div
                    key={p.childId}
                    className="flex items-start gap-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40"
                  >
                    {p.reason === "ambiguous" ? (
                      <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-300 mt-0.5 shrink-0" />
                    ) : (
                      <HelpCircle className="w-4 h-4 text-amber-700 dark:text-amber-300 mt-0.5 shrink-0" />
                    )}
                    <span className="text-sm">
                      <span className="text-foreground font-medium">
                        {p.childName}
                      </span>
                      <span className="block text-xs text-muted">
                        {p.schoolName || "—"} · {UNMATCHED_COPY[p.reason]}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">
                Open each enrolment and use &quot;Assign to service&quot;.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {done ? "Close" : "Cancel"}
          </Button>
          {matched.length > 0 && (
            <Button
              onClick={() => apply.mutate()}
              disabled={accepted.length === 0 || apply.isPending}
            >
              {apply.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Applying…</>
              ) : (
                `Place ${accepted.length}`
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

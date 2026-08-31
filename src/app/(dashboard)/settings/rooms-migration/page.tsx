"use client";

/**
 * Where the rooms migration has got to, and whether the next step is
 * allowed to start.
 *
 * The gate already existed as `GET /api/services/rooms/backfill`, which
 * meant it existed for nobody: a check that has to be reached by hand
 * with a URL is a check that doesn't get run. The whole point of Stages
 * 0 and 1 is that their failure mode is SILENT — a room key with no row
 * behind it, or a booking with no room, throws no error today and turns
 * into an invisible record the moment Stage 2 moves a read. Something
 * that quiet needs a screen.
 *
 * Deliberately plain. This is an engineering instrument for the handful
 * of people running the migration, not a feature — it says what is true,
 * what it means, and what to do about it.
 */

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Play,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

interface ServiceIssue {
  serviceId: string;
  serviceName: string;
  expected: number;
  actual: number;
  missing: string[];
  orphaned: string[];
  drifted: string[];
}

interface GateStatus {
  clean: boolean;
  /** Stage 0 on its own — rooms match the JSON they're derived from. */
  roomsClean: boolean;
  services: number;
  issues: ServiceIssue[];
  /** Stage 1 — rows carrying a session slot but no room. */
  unresolved: Array<{ table: string; unresolved: number }>;
}

interface BackfillResult extends GateStatus {
  created: number;
  updated: number;
  orphaned: number;
  filled: Array<{ table: string; filled: number }>;
}

export default function RoomsMigrationPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<GateStatus>({
    queryKey: ["rooms", "migration-gate"],
    queryFn: () => fetchApi("/api/services/rooms/backfill"),
    retry: 2,
  });

  const backfill = useMutation({
    mutationFn: () =>
      mutateApi<BackfillResult>("/api/services/rooms/backfill", {
        method: "POST",
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["rooms", "migration-gate"] });
      const filled = res.filled.reduce((a, t) => a + t.filled, 0);
      toast({
        description: res.clean
          ? `Done — ${res.created} rooms created, ${filled} rows linked. The gate is clean.`
          : `${res.created} rooms created, ${filled} rows linked. Some checks still fail — see below.`,
      });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <button
        onClick={() => router.push("/settings")}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Settings
      </button>

      <div>
        <h1 className="text-xl font-heading font-semibold tracking-tight text-foreground">
          Rooms migration
        </h1>
        <p className="mt-1 text-sm text-muted">
          Rooms are moving out of seven fixed slots and into records of their
          own, so a centre can add as many as it needs. It happens in stages;
          nothing on this page changes what anyone sees yet.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : !data ? (
        <p className="text-sm text-muted">Couldn&apos;t read the status.</p>
      ) : (
        <>
          {/* The verdict, before any of the detail. */}
          <div
            className={`flex items-start gap-3 rounded-xl border p-4 ${
              data.clean
                ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
                : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
            }`}
          >
            {data.clean ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            )}
            <div className="min-w-0">
              <p
                className={`text-sm font-semibold ${
                  data.clean
                    ? "text-emerald-900 dark:text-emerald-200"
                    : "text-amber-900 dark:text-amber-200"
                }`}
              >
                {data.clean
                  ? "Everything reconciles — the next stage can start"
                  : "Not ready for the next stage"}
              </p>
              <p
                className={`mt-1 text-sm ${
                  data.clean
                    ? "text-emerald-900 dark:text-emerald-200"
                    : "text-amber-900 dark:text-amber-200"
                }`}
              >
                {data.clean ? (
                  <>
                    Every room matches the settings it came from, and every
                    booking, shift and attendance record is linked to one.
                  </>
                ) : (
                  <>
                    Running the backfill below usually clears this. It is safe
                    to run at any time and safe to run twice — it re-derives
                    what the settings already say rather than inventing
                    anything.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Run the backfill
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Rebuilds the room records from each centre&apos;s settings, then
                links any records still missing one. Nothing is deleted.
              </p>
            </div>
            <Button
              onClick={() => backfill.mutate()}
              disabled={backfill.isPending}
            >
              {backfill.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Run
            </Button>
          </div>

          {/* Stage 0 */}
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              {data.roomsClean ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <h2 className="text-sm font-semibold text-foreground">
                Rooms match their settings
              </h2>
              <span className="text-2xs text-muted">
                {data.services} {data.services === 1 ? "centre" : "centres"}
              </span>
            </div>

            {data.issues.length === 0 ? (
              <p className="text-sm text-muted">
                Every centre&apos;s rooms match what its Rooms &amp; fees page
                says.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.issues.map((s) => (
                  <li key={s.serviceId} className="py-2.5">
                    <p className="text-sm text-foreground">{s.serviceName}</p>
                    <p className="text-2xs text-muted">
                      {s.actual} of {s.expected} rooms
                      {s.missing.length > 0 && (
                        <> · missing {s.missing.join(", ")}</>
                      )}
                      {s.drifted.length > 0 && (
                        <> · out of date {s.drifted.join(", ")}</>
                      )}
                      {/* Orphans don't block: a room removed from settings
                          is legitimate history and may hold attendance. */}
                      {s.orphaned.length > 0 && (
                        <> · no longer in settings {s.orphaned.join(", ")}</>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Stage 1 */}
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              {data.unresolved.length === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <h2 className="text-sm font-semibold text-foreground">
                Records linked to a room
              </h2>
            </div>

            {data.unresolved.length === 0 ? (
              <p className="text-sm text-muted">
                Every booking, shift, attendance record and fee is linked to a
                room.
              </p>
            ) : (
              <>
                <p className="mb-2 text-sm text-muted">
                  These records still carry a session type but no room. They
                  work normally today — the room link is what the next stage
                  will read, so it has to be filled first.
                </p>
                <ul className="divide-y divide-border">
                  {data.unresolved.map((t) => (
                    <li
                      key={t.table}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span className="text-foreground">{t.table}</span>
                      <span className="text-muted">
                        {t.unresolved.toLocaleString()} unlinked
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <p className="text-2xs text-muted">
            Stages 0 and 1 are done. Stage 2 moves the app over to reading
            rooms, and Stage 3 is where a centre can finally add one — see{" "}
            <code>docs/rooms-migration-plan.md</code>.
          </p>
        </>
      )}
    </div>
  );
}

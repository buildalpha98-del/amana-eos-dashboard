"use client";

/**
 * Headcounts and evacuation drills.
 *
 * Two jobs: make recording a count fast enough that people actually do
 * it mid-session, and make the register readable by someone who turns up
 * asking when the last drill was.
 *
 * That second question gets its own banner, because "when did you last
 * evacuate?" is the one an assessor opens with and the one nobody can
 * answer from memory.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Flame,
  Plus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

interface HeadcountRow {
  id: string;
  kind: string;
  conductedAt: string;
  programmeName: string | null;
  childrenCount: number;
  staffCount: number;
  visitorsCount: number;
  totalPeople: number;
  evacuationSeconds: number | null;
  issuesIdentified: string | null;
  notes: string | null;
  conductedBy: string | null;
  signedOffAt: string | null;
  signedOffBy: string | null;
  excursion: { id: string; title: string } | null;
}

const KIND_LABELS: Record<string, string> = {
  head_count: "Head count",
  evacuation_drill: "Evacuation drill",
  excursion_head_count: "Excursion head count",
  bus_run: "Bus run",
};

const field =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

/** Drills are expected termly; past that it's worth saying out loud. */
const DRILL_DUE_DAYS = 90;

export function ServiceHeadcountsTab({ serviceId }: { serviceId: string }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState("head_count");
  const [children, setChildren] = useState("");
  const [staff, setStaff] = useState("");
  const [visitors, setVisitors] = useState("0");
  const [seconds, setSeconds] = useState("");
  const [issues, setIssues] = useState("");
  const [notes, setNotes] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const key = ["service", serviceId, "headcounts"];
  const { data, isLoading } = useQuery<{
    headcounts: HeadcountRow[];
    daysSinceLastDrill: number | null;
  }>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/services/${serviceId}/headcounts`),
    retry: 1,
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi(`/api/services/${serviceId}/headcounts`, { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setAdding(false);
      setChildren("");
      setStaff("");
      setVisitors("0");
      setSeconds("");
      setIssues("");
      setNotes("");
      toast({ description: "Count recorded." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const sign = useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/services/${serviceId}/headcounts/${id}`, {
        method: "PATCH",
        body: { signOff: true },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ description: "Counter-signed." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }

  const rows = data?.headcounts ?? [];
  const days = data?.daysSinceLastDrill ?? null;
  const drillOverdue = days === null || days > DRILL_DUE_DAYS;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Headcounts &amp; evacuations
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Every count records children, staff and visitors — a count of
            children alone can&apos;t show the building was cleared.
          </p>
        </div>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" /> Record a count
          </Button>
        )}
      </div>

      {/* The question an assessor opens with. */}
      <div
        className={`rounded-lg border p-4 ${
          drillOverdue
            ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
            : "border-border bg-card"
        }`}
      >
        <p className="flex items-center gap-2 text-sm">
          <Flame
            className={`h-4 w-4 ${
              drillOverdue ? "text-amber-600" : "text-muted"
            }`}
          />
          <span
            className={
              drillOverdue
                ? "text-amber-900 dark:text-amber-100"
                : "text-foreground"
            }
          >
            {days === null
              ? "No evacuation drill has been recorded here yet."
              : days === 0
                ? "Last evacuation drill: today."
                : `Last evacuation drill: ${days} day${days === 1 ? "" : "s"} ago.`}
          </span>
        </p>
      </div>

      {adding && (
        <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(KIND_LABELS).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  kind === k
                    ? "bg-brand text-white"
                    : "border border-border text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="hc-children" className="block text-sm font-medium text-foreground mb-1">
                Children
              </label>
              <input
                id="hc-children"
                type="number"
                min={0}
                inputMode="numeric"
                className={field}
                value={children}
                onChange={(e) => setChildren(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="hc-staff" className="block text-sm font-medium text-foreground mb-1">
                Staff
              </label>
              <input
                id="hc-staff"
                type="number"
                min={0}
                inputMode="numeric"
                className={field}
                value={staff}
                onChange={(e) => setStaff(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="hc-visitors" className="block text-sm font-medium text-foreground mb-1">
                Visitors
              </label>
              <input
                id="hc-visitors"
                type="number"
                min={0}
                inputMode="numeric"
                className={field}
                value={visitors}
                onChange={(e) => setVisitors(e.target.value)}
              />
            </div>
          </div>

          {kind === "evacuation_drill" && (
            <>
              <div>
                <label htmlFor="hc-seconds" className="block text-sm font-medium text-foreground mb-1">
                  Time to clear the building{" "}
                  <span className="text-muted">(seconds)</span>
                </label>
                <input
                  id="hc-seconds"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className={field}
                  value={seconds}
                  onChange={(e) => setSeconds(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="hc-issues" className="block text-sm font-medium text-foreground mb-1">
                  What didn&apos;t go to plan?
                </label>
                <textarea
                  id="hc-issues"
                  rows={2}
                  className={field}
                  value={issues}
                  onChange={(e) => setIssues(e.target.value)}
                  placeholder="&quot;Nothing&quot; is a fine answer — record it either way."
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="hc-notes" className="block text-sm font-medium text-foreground mb-1">
              Notes <span className="text-muted">(optional)</span>
            </label>
            <textarea
              id="hc-notes"
              rows={2}
              className={field}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() =>
                create.mutate({
                  kind,
                  childrenCount: Number(children || 0),
                  staffCount: Number(staff || 0),
                  visitorsCount: Number(visitors || 0),
                  ...(kind === "evacuation_drill" && seconds
                    ? { evacuationSeconds: Number(seconds) }
                    : {}),
                  ...(issues.trim() ? { issuesIdentified: issues.trim() } : {}),
                  ...(notes.trim() ? { notes: notes.trim() } : {}),
                })
              }
              disabled={create.isPending || children.trim() === ""}
            >
              {create.isPending ? "Recording…" : "Record"}
            </Button>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing recorded yet. Counts taken here become the register an
          assessor asks to see.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {rows.map((r) => (
            <li key={r.id} className="p-4 space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {KIND_LABELS[r.kind] ?? r.kind}
                    {r.programmeName && (
                      <span className="text-muted"> · {r.programmeName}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(r.conductedAt).toLocaleString("en-AU", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {r.conductedBy && ` · counted by ${r.conductedBy}`}
                  </p>
                </div>
                <p className="text-sm text-foreground shrink-0 flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-muted" />
                  {r.totalPeople}
                </p>
              </div>

              <p className="text-xs text-muted">
                {r.childrenCount} children · {r.staffCount} staff ·{" "}
                {r.visitorsCount} visitors
                {r.evacuationSeconds != null &&
                  ` · cleared in ${Math.floor(r.evacuationSeconds / 60)}m ${r.evacuationSeconds % 60}s`}
              </p>

              {r.excursion && (
                <p className="text-xs text-muted">For {r.excursion.title}</p>
              )}
              {r.issuesIdentified && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {r.issuesIdentified}
                </p>
              )}
              {r.notes && (
                <p className="text-xs text-foreground/80">{r.notes}</p>
              )}

              {r.signedOffAt ? (
                <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Counter-signed{r.signedOffBy && ` by ${r.signedOffBy}`}
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Not counter-signed
                  </span>
                  <button
                    type="button"
                    disabled={busyId === r.id && sign.isPending}
                    onClick={() => {
                      setBusyId(r.id);
                      sign.mutate(r.id, { onSettled: () => setBusyId(null) });
                    }}
                    className="rounded-lg border border-border px-2 py-1 text-xs text-foreground hover:bg-surface"
                  >
                    {busyId === r.id && sign.isPending
                      ? "Signing…"
                      : "Counter-sign"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

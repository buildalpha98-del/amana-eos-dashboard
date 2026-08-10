"use client";

/**
 * Who has what training assigned — the person-first view.
 *
 * Three admin views existed and none answered "what is assigned to this
 * person": Compliance answers "who is BEHIND", LMS Courses is
 * course-first, Induction is a pipeline board. So an educator could open
 * My Training and see eight essential courses while an owner saw nothing
 * assigned to them.
 *
 * The specific trap this surfaces: the seeded induction courses ship as
 * DRAFTS, and the compliance report only counts published ones. A draft
 * assignment is real — the learner sees it and can work through it — but
 * it is invisible to every compliance number. Rows say so explicitly
 * rather than leaving the discrepancy to be discovered.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

interface Assignment {
  enrollmentId: string;
  status: string;
  dueDate: string | null;
  enrolledAt: string;
  completedAt: string | null;
  user: { id: string; name: string; email: string; role: string };
  course: { id: string; title: string; track: string; status: string };
  progressPct: number;
  countedInCompliance: boolean;
}

const TRACKS = [
  { value: "", label: "All types" },
  { value: "essential", label: "Essential — induction" },
  { value: "monthly", label: "Monthly — refreshers" },
  { value: "library", label: "Library — optional" },
];

const ROLES = [
  { value: "", label: "All roles" },
  { value: "owner", label: "Owner" },
  { value: "head_office", label: "Head office" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Director of Service" },
  { value: "staff", label: "Educator" },
  { value: "marketing", label: "Marketing" },
];

const field =
  "px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export function AssignmentsTab() {
  const qc = useQueryClient();
  const [track, setTrack] = useState("");
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const key = ["lms", "assignments", track, role];
  const { data, isLoading } = useQuery<{ assignments: Assignment[] }>({
    queryKey: key,
    queryFn: () => {
      const p = new URLSearchParams();
      if (track) p.set("track", track);
      if (role) p.set("role", role);
      const qs = p.toString();
      return fetchApi(`/api/lms/assignments${qs ? `?${qs}` : ""}`);
    },
    retry: 2,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["lms", "assignments"] });
    // The compliance numbers move when an assignment goes.
    qc.invalidateQueries({ queryKey: ["lms", "compliance"] });
    setSelected(new Set());
  };

  const removeOne = useMutation({
    mutationFn: (enrollmentId: string) =>
      mutateApi("/api/lms/enrollments", {
        method: "DELETE",
        body: { enrollmentId },
      }),
    onSuccess: () => {
      invalidate();
      toast({ description: "Assignment removed." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const removeMany = useMutation({
    mutationFn: (enrollmentIds: string[]) =>
      mutateApi<{ removed: number; skippedCompleted: number }>(
        "/api/lms/assignments/bulk",
        { method: "POST", body: { enrollmentIds } },
      ),
    onSuccess: (res) => {
      invalidate();
      toast({
        description:
          res.skippedCompleted > 0
            ? `Removed ${res.removed}. Kept ${res.skippedCompleted} already completed — those are training records.`
            : `Removed ${res.removed}.`,
      });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const setDue = useMutation({
    mutationFn: (v: { enrollmentId: string; dueDate: string | null }) =>
      mutateApi("/api/lms/assignments", { method: "PATCH", body: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lms", "assignments"] });
      toast({ description: "Due date updated." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  /**
   * Stable identity across renders. `data?.assignments ?? []` builds a
   * fresh array every time, which would make the memo below recompute on
   * every keystroke anywhere in the component.
   */
  const all = useMemo(() => data?.assignments ?? [], [data]);

  /** Grouped per person — the whole point of this view. */
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? all.filter(
          (a) =>
            a.user.name.toLowerCase().includes(q) ||
            a.user.email.toLowerCase().includes(q) ||
            a.course.title.toLowerCase().includes(q),
        )
      : all;

    const byUser = new Map<string, { user: Assignment["user"]; items: Assignment[] }>();
    for (const a of filtered) {
      let g = byUser.get(a.user.id);
      if (!g) {
        g = { user: a.user, items: [] };
        byUser.set(a.user.id, g);
      }
      g.items.push(a);
    }
    return [...byUser.values()].sort((x, y) =>
      x.user.name.localeCompare(y.user.name),
    );
  }, [all, search]);

  const draftCount = all.filter((a) => !a.countedInCompliance).length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          className={`${field} flex-1 min-w-[12rem]`}
          placeholder="Search staff or course…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search assignments"
        />
        <select
          className={field}
          value={track}
          onChange={(e) => setTrack(e.target.value)}
          aria-label="Filter by assignment type"
        >
          {TRACKS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          className={field}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="Filter by role"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {draftCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            <strong>{draftCount}</strong>{" "}
            {draftCount === 1 ? "assignment is" : "assignments are"} on a
            course that hasn&apos;t been published. Staff can see and work
            through {draftCount === 1 ? "it" : "them"} in My Training, but{" "}
            {draftCount === 1 ? "it doesn't" : "they don't"} appear in
            Compliance or the weekly reminder emails. Publish the course to
            make {draftCount === 1 ? "it" : "them"} count.
          </p>
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
          <p className="text-sm text-foreground">
            {selected.size} selected
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button
              variant="destructive"
              disabled={removeMany.isPending}
              onClick={() => removeMany.mutate([...selected])}
            >
              <Trash2 className="h-4 w-4" />
              Remove {selected.size}
            </Button>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nothing assigned"
          description={
            all.length === 0
              ? "No training is assigned to anyone matching these filters."
              : "No staff or course matches that search."
          }
        />
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div
              key={g.user.id}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {g.user.name}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {g.user.email} · {g.user.role}
                  </p>
                </div>
                <span className="shrink-0 text-2xs text-muted">
                  {g.items.length}{" "}
                  {g.items.length === 1 ? "assignment" : "assignments"}
                </span>
              </div>

              <ul className="divide-y divide-border">
                {g.items.map((a) => (
                  <li
                    key={a.enrollmentId}
                    className="flex flex-wrap items-center gap-3 py-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(a.enrollmentId)}
                      onChange={() => toggle(a.enrollmentId)}
                      aria-label={`Select ${a.course.title} for ${g.user.name}`}
                      className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">
                        {a.course.title}
                        {!a.countedInCompliance && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-2xs text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                            {a.course.status === "published"
                              ? "not required"
                              : "draft — not in compliance"}
                          </span>
                        )}
                      </p>
                      <p className="text-2xs text-muted">
                        {a.course.track} · {a.status} · {a.progressPct}% done ·
                        assigned {fmtDate(a.enrolledAt)}
                      </p>
                    </div>

                    <label className="flex items-center gap-1.5 text-2xs text-muted">
                      Due
                      <input
                        type="date"
                        className="rounded-lg border border-border bg-card px-2 py-1 text-xs"
                        defaultValue={
                          a.dueDate ? a.dueDate.slice(0, 10) : ""
                        }
                        aria-label={`Due date for ${a.course.title}`}
                        onBlur={(e) => {
                          const next = e.target.value || null;
                          const current = a.dueDate
                            ? a.dueDate.slice(0, 10)
                            : null;
                          if (next === current) return;
                          setDue.mutate({
                            enrollmentId: a.enrollmentId,
                            dueDate: next,
                          });
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      aria-label={`Remove ${a.course.title} from ${g.user.name}`}
                      onClick={() => removeOne.mutate(a.enrollmentId)}
                      className="shrink-0 rounded-lg p-2 text-muted hover:bg-surface hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

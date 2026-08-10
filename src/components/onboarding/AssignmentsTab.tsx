"use client";

/**
 * Everything assigned to a staff member — training AND onboarding packs.
 *
 * Two systems that have never known about each other: `LMSEnrollment`
 * holds courses, `StaffOnboarding` holds pack assignments, and no screen
 * showed both. Answering "what does this person still have to do?" meant
 * two places and a mental join.
 *
 * They stay separate on the server (different tables, different
 * completion semantics, different routes) and are merged here for
 * display — see `staff-assignments.ts`, where the mapping lives so it
 * can be tested away from the rendering.
 *
 * The trap this surfaces: the seeded induction courses ship as DRAFTS,
 * and the compliance report only counts published ones. A draft
 * assignment is real — the learner sees it and can work through it — but
 * invisible to every compliance number. Rows say so rather than leaving
 * the discrepancy to be discovered.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import {
  groupAssignments,
  isAssignmentComplete,
  NO_SERVICE,
  type AssignmentKind,
  type CompletionFilter,
  type OnboardingAssignment,
  type TrainingAssignment,
  type UnifiedAssignment,
} from "@/lib/staff-assignments";

const KINDS: Array<{ value: AssignmentKind | "all"; label: string }> = [
  { value: "all", label: "Training & onboarding" },
  { value: "training", label: "Training only" },
  { value: "onboarding", label: "Onboarding packs only" },
];

const TRACKS = [
  { value: "", label: "All training types" },
  { value: "essential", label: "Essential — induction" },
  { value: "monthly", label: "Monthly — refreshers" },
  { value: "library", label: "Library — optional" },
];

const COMPLETION: Array<{ value: CompletionFilter; label: string }> = [
  { value: "outstanding", label: "Still to do" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "Everything" },
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

/** Selection has to carry the kind — the two id spaces are unrelated. */
type SelectionKey = `${AssignmentKind}:${string}`;
const keyOf = (a: UnifiedAssignment): SelectionKey =>
  `${a.kind}:${a.assignmentId}`;

export function AssignmentsTab() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<AssignmentKind | "all">("all");
  const [track, setTrack] = useState("");
  const [role, setRole] = useState("");
  const [serviceId, setServiceId] = useState("");
  /**
   * Finished work is a record, not a task. It stays reachable, but the
   * list opens on what is still outstanding.
   */
  const [completion, setCompletion] = useState<CompletionFilter>("outstanding");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<SelectionKey>>(new Set());

  const trainingQuery = useQuery<{ assignments: TrainingAssignment[] }>({
    queryKey: ["lms", "assignments", track, role],
    queryFn: () => {
      const p = new URLSearchParams();
      if (track) p.set("track", track);
      if (role) p.set("role", role);
      const qs = p.toString();
      return fetchApi(`/api/lms/assignments${qs ? `?${qs}` : ""}`);
    },
    enabled: kind !== "onboarding",
    retry: 2,
  });

  const onboardingQuery = useQuery<OnboardingAssignment[]>({
    queryKey: ["onboarding", "assignments"],
    queryFn: () => fetchApi("/api/onboarding/assign"),
    enabled: kind !== "training",
    retry: 2,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["lms", "assignments"] });
    qc.invalidateQueries({ queryKey: ["onboarding", "assignments"] });
    // Removing an assignment moves the compliance numbers.
    qc.invalidateQueries({ queryKey: ["lms", "compliance"] });
    setSelected(new Set());
  };

  const removeOne = useMutation({
    mutationFn: (a: UnifiedAssignment) =>
      a.kind === "training"
        ? mutateApi("/api/lms/enrollments", {
            method: "DELETE",
            body: { enrollmentId: a.assignmentId },
          })
        : mutateApi(
            `/api/onboarding/assign?onboardingId=${a.assignmentId}`,
            { method: "DELETE" },
          ),
    onSuccess: () => {
      invalidate();
      toast({ description: "Assignment removed." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const removeMany = useMutation({
    /**
     * Two calls, one per kind, because they're different tables with
     * different completion rules. Only fired for kinds actually
     * selected.
     */
    mutationFn: async (rows: UnifiedAssignment[]) => {
      const trainingIds = rows
        .filter((r) => r.kind === "training")
        .map((r) => r.assignmentId);
      const onboardingIds = rows
        .filter((r) => r.kind === "onboarding")
        .map((r) => r.assignmentId);

      const results = await Promise.all([
        trainingIds.length
          ? mutateApi<{ removed: number; skippedCompleted: number }>(
              "/api/lms/assignments/bulk",
              { method: "POST", body: { enrollmentIds: trainingIds } },
            )
          : Promise.resolve({ removed: 0, skippedCompleted: 0 }),
        onboardingIds.length
          ? mutateApi<{ removed: number; skippedCompleted: number }>(
              "/api/onboarding/assign/bulk",
              { method: "POST", body: { onboardingIds } },
            )
          : Promise.resolve({ removed: 0, skippedCompleted: 0 }),
      ]);

      return {
        removed: results[0].removed + results[1].removed,
        skippedCompleted:
          results[0].skippedCompleted + results[1].skippedCompleted,
      };
    },
    onSuccess: (res) => {
      invalidate();
      toast({
        description:
          res.skippedCompleted > 0
            ? `Removed ${res.removed}. Kept ${res.skippedCompleted} already completed — those are records.`
            : `Removed ${res.removed}.`,
      });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const setDue = useMutation({
    mutationFn: (v: { row: UnifiedAssignment; dueDate: string | null }) =>
      v.row.kind === "training"
        ? mutateApi("/api/lms/assignments", {
            method: "PATCH",
            body: { enrollmentId: v.row.assignmentId, dueDate: v.dueDate },
          })
        : mutateApi("/api/onboarding/assign", {
            method: "PATCH",
            body: { onboardingId: v.row.assignmentId, dueDate: v.dueDate },
          }),
    onSuccess: () => {
      invalidate();
      toast({ description: "Due date updated." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const training = useMemo(
    () => trainingQuery.data?.assignments ?? [],
    [trainingQuery.data],
  );
  const onboarding = useMemo(
    () => onboardingQuery.data ?? [],
    [onboardingQuery.data],
  );

  /**
   * Centre options come from the rows on screen rather than from the
   * services list, so the dropdown only ever offers a filter that has
   * someone behind it. "No centre" is a real answer here — owners and
   * head office aren't attached to one.
   */
  const serviceOptions = useMemo(() => {
    const byId = new Map<string, string>();
    let anyUnattached = false;
    for (const u of [
      ...training.map((t) => t.user),
      ...onboarding.map((o) => o.user),
    ]) {
      if (u.service) byId.set(u.service.id, u.service.name);
      else anyUnattached = true;
    }
    const opts = [...byId.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return anyUnattached
      ? [...opts, { value: NO_SERVICE, label: "No centre attached" }]
      : opts;
  }, [training, onboarding]);

  const groups = useMemo(
    () =>
      groupAssignments(training, onboarding, {
        search,
        kind,
        serviceId,
        completion,
      }),
    [training, onboarding, search, kind, serviceId, completion],
  );

  const allRows = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const draftCount = allRows.filter(
    (r) => r.countedInCompliance === false,
  ).length;

  const isLoading =
    (kind !== "onboarding" && trainingQuery.isLoading) ||
    (kind !== "training" && onboardingQuery.isLoading);

  const toggle = (a: UnifiedAssignment) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const k = keyOf(a);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const selectedRows = allRows.filter((r) => selected.has(keyOf(r)));

  /**
   * Select-all only reaches rows that can actually be removed. Both bulk
   * endpoints refuse completed assignments — they're the record that the
   * training happened — so sweeping them in would produce a "removed 0,
   * kept 14" toast and no change.
   */
  const removable = allRows.filter((r) => !isAssignmentComplete(r));
  const removableKeys = removable.map(keyOf);
  const allRemovableSelected =
    removableKeys.length > 0 && removableKeys.every((k) => selected.has(k));

  const setSelection = (keys: SelectionKey[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          className={`${field} flex-1 min-w-[12rem]`}
          placeholder="Search staff, course or pack…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search assignments"
        />
        <select
          className={field}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as AssignmentKind | "all");
            setSelected(new Set());
          }}
          aria-label="Filter by what kind of assignment"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        {kind !== "onboarding" && (
          <select
            className={field}
            value={track}
            onChange={(e) => setTrack(e.target.value)}
            aria-label="Filter by training type"
          >
            {TRACKS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        )}
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
        {serviceOptions.length > 1 && (
          <select
            className={field}
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setSelected(new Set());
            }}
            aria-label="Filter by the centre the staff member is attached to"
          >
            <option value="">All centres</option>
            {serviceOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        )}
        <select
          className={field}
          value={completion}
          onChange={(e) => {
            setCompletion(e.target.value as CompletionFilter);
            setSelected(new Set());
          }}
          aria-label="Filter by how much has been completed"
        >
          {COMPLETION.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Role filtering is a training-side query param; the onboarding
          endpoint has no equivalent, so say so rather than appearing to
          filter both. */}
      {role && kind !== "training" && (
        <p className="text-2xs text-muted">
          The role filter applies to training only — onboarding packs are
          always shown.
        </p>
      )}

      {draftCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-900 dark:text-amber-200">
            <strong>{draftCount}</strong> training{" "}
            {draftCount === 1 ? "assignment is" : "assignments are"} on a course
            that hasn&apos;t been published. Staff can see and work through{" "}
            {draftCount === 1 ? "it" : "them"} in My Training, but{" "}
            {draftCount === 1 ? "it doesn't" : "they don't"} appear in Compliance
            or the weekly reminder emails. Publish the course from the Induction
            tab to make {draftCount === 1 ? "it" : "them"} count.
          </p>
        </div>
      )}

      {removable.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={allRemovableSelected}
              onChange={(e) => setSelection(removableKeys, e.target.checked)}
              className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
            />
            {selected.size > 0
              ? `${selected.size} selected`
              : `Select all ${removable.length}`}
          </label>
          {selected.size > 0 && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <Button
                variant="destructive"
                disabled={removeMany.isPending}
                onClick={() => removeMany.mutate(selectedRows)}
              >
                <Trash2 className="h-4 w-4" />
                Remove {selected.size}
              </Button>
            </div>
          )}
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            completion === "completed"
              ? "Nothing completed yet"
              : "Nothing assigned"
          }
          /* `allRows` comes from the groups, so it can't tell an empty
             result from an empty dataset — the raw responses can. */
          description={
            training.length + onboarding.length === 0
              ? "No training or onboarding has been assigned to anyone yet."
              : "Nothing matches these filters."
          }
        />
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div
              key={g.userId}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  {(() => {
                    const keys = g.items
                      .filter((a) => !isAssignmentComplete(a))
                      .map(keyOf);
                    if (keys.length === 0) return null;
                    return (
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
                        aria-label={`Select all assignments for ${g.userName}`}
                        checked={keys.every((k) => selected.has(k))}
                        onChange={(e) => setSelection(keys, e.target.checked)}
                      />
                    );
                  })()}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {g.userName}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {g.userEmail}
                      {g.userRole ? ` · ${g.userRole}` : ""}
                      {g.userServiceName ? ` · ${g.userServiceName}` : ""}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-2xs text-muted">
                  {g.completedCount} of {g.outstandingCount + g.completedCount}{" "}
                  done
                </span>
              </div>

              {/* Someone with nothing outstanding is kept on the list and
                  marked finished, rather than dropping out — "no rows"
                  and "all done" are different answers. */}
              {g.items.length === 0 ? (
                <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  All {g.completedCount}{" "}
                  {g.completedCount === 1 ? "assignment" : "assignments"}{" "}
                  completed
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {g.items.map((a) => {
                    const done = isAssignmentComplete(a);
                    return (
                      <li
                        key={keyOf(a)}
                        className="flex flex-wrap items-center gap-3 py-2.5"
                      >
                        {/* A completed assignment is the record that the
                            training happened; both remove endpoints refuse
                            it, so it isn't offered for selection. */}
                        <input
                          type="checkbox"
                          checked={selected.has(keyOf(a))}
                          onChange={() => toggle(a)}
                          disabled={done}
                          aria-label={`Select ${a.title} for ${g.userName}`}
                          className="h-4 w-4 rounded border-border text-brand focus:ring-brand disabled:opacity-40"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate text-sm text-foreground">
                            {a.kind === "training" ? (
                              <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted" />
                            ) : (
                              <ClipboardList className="h-3.5 w-3.5 shrink-0 text-muted" />
                            )}
                            {a.title}
                            {done && (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            )}
                            {a.countedInCompliance === false && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-2xs text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                                {a.courseStatus === "published"
                                  ? "not required"
                                  : "draft — not in compliance"}
                              </span>
                            )}
                          </p>
                          <p className="text-2xs text-muted">
                            {a.kind === "training" ? "Training" : "Onboarding"} ·{" "}
                            {a.subtitle} · {a.status} · {a.progressPct}% done ·
                            assigned {fmtDate(a.assignedAt)}
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
                            aria-label={`Due date for ${a.title}`}
                            onBlur={(e) => {
                              const next = e.target.value || null;
                              const current = a.dueDate
                                ? a.dueDate.slice(0, 10)
                                : null;
                              if (next === current) return;
                              setDue.mutate({ row: a, dueDate: next });
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          aria-label={`Remove ${a.title} from ${g.userName}`}
                          onClick={() => removeOne.mutate(a)}
                          className="shrink-0 rounded-lg p-2 text-muted hover:bg-surface hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

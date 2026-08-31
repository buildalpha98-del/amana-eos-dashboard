"use client";

/**
 * Arming the induction gate — the pre-flight and the switch.
 *
 * Publishing an essential course isn't a visibility toggle. It is the
 * rollout switch: `getInductionReadiness` counts published essential
 * courses only, so each one that goes live becomes something a new
 * starter must finish before they can be rostered or clock in.
 *
 * The panel therefore leads with consequences, not with a button. It
 * says how many staff the gate currently applies to, how many enrolments
 * would start appearing in Compliance and the weekly reminder emails,
 * and — per course — anything that would make it impossible to complete.
 *
 * The blocker that matters most is a quiz with no active questions: a
 * learner can never pass it, so they can never finish the course, clear
 * induction, or clock in. There is no error for that state; the course
 * just becomes a wall. Publishing is refused unless someone explicitly
 * overrides.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import type { CourseReadiness } from "@/lib/course-readiness";

interface Readiness {
  track: string;
  courses: CourseReadiness[];
  impact: {
    draftCourses: number;
    publishable: number;
    blocked: number;
    gateEligibleStaff: number;
    wouldBecomeOutstanding: number;
  };
}

export function PublishEssentialPanel() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const key = ["lms", "publish-readiness", "essential"];
  const { data, isLoading } = useQuery<Readiness>({
    queryKey: key,
    queryFn: () =>
      fetchApi("/api/lms/courses/publish-readiness?track=essential"),
    retry: 1,
  });

  const publish = useMutation({
    mutationFn: (v: { courseIds: string[]; force?: boolean }) =>
      mutateApi<{ published: number; skipped: number }>(
        "/api/lms/courses/publish-readiness",
        { method: "POST", body: v },
      ),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["lms"] });
      setSelected(new Set());
      setConfirming(false);
      toast({
        description: `Published ${res.published}. The induction gate now counts ${res.published === 1 ? "it" : "them"}.`,
      });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (!data) return null;

  const { courses, impact } = data;

  if (impact.draftCourses === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Essential training is live
        </h3>
        <p className="mt-1 text-xs text-muted">
          Every essential course is published. The induction gate is active
          for new starters.
        </p>
      </div>
    );
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedBlocked = courses.filter(
    (c) => selected.has(c.courseId) && !c.publishable,
  );

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ShieldAlert className="h-4 w-4 text-brand" />
          Publish essential training
        </h3>
        <p className="mt-1 text-xs text-muted">
          Publishing arms the induction gate. Each published course becomes
          something a new starter must finish before they can be rostered or
          clock in.
        </p>
      </div>

      {/* Consequences first. */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
        <p className="text-sm text-amber-900 dark:text-amber-200">
          Publishing all {impact.draftCourses} would:
        </p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs text-amber-900 dark:text-amber-200">
          <li>
            Gate <strong>{impact.gateEligibleStaff}</strong>{" "}
            {impact.gateEligibleStaff === 1 ? "staff member" : "staff members"}{" "}
            currently marked new starter or in training. Everyone else is
            cleared and unaffected.
          </li>
          <li>
            Make <strong>{impact.wouldBecomeOutstanding}</strong> outstanding{" "}
            {impact.wouldBecomeOutstanding === 1 ? "enrolment" : "enrolments"}{" "}
            start counting in Compliance — and start the weekly reminder
            emails to those staff.
          </li>
        </ul>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {courses.map((c) => (
          <li key={c.courseId} className="p-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(c.courseId)}
                onChange={() => toggle(c.courseId)}
                className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm text-foreground">
                  {c.publishable ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                  )}
                  {c.courseTitle}
                </span>

                {c.blockers.map((b, i) => (
                  <span
                    key={`b-${i}`}
                    className="mt-1 block text-2xs text-red-700 dark:text-red-300"
                  >
                    {b.moduleTitle ? `${b.moduleTitle}: ` : ""}
                    {b.message}
                  </span>
                ))}
                {c.warnings.map((w, i) => (
                  <span
                    key={`w-${i}`}
                    className="mt-1 flex items-start gap-1 text-2xs text-amber-700 dark:text-amber-300"
                  >
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                      {w.moduleTitle ? `${w.moduleTitle}: ` : ""}
                      {w.message}
                    </span>
                  </span>
                ))}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {selectedBlocked.length > 0 && (
        <p className="text-xs text-red-700 dark:text-red-300">
          {selectedBlocked.length} of the selected{" "}
          {selectedBlocked.length === 1 ? "course has" : "courses have"} a
          blocker. Publishing{" "}
          {selectedBlocked.length === 1 ? "it" : "them"} would leave staff
          unable to finish, and therefore unable to clock in. Fix the course,
          or publish the rest.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!confirming ? (
          <>
            <Button
              disabled={selected.size === 0}
              onClick={() => setConfirming(true)}
            >
              Publish {selected.size > 0 ? selected.size : ""} selected
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                setSelected(
                  new Set(
                    courses.filter((c) => c.publishable).map((c) => c.courseId),
                  ),
                )
              }
            >
              Select all ready ({impact.publishable})
            </Button>
          </>
        ) : (
          <>
            <p className="w-full text-sm text-foreground">
              Publish {selected.size}{" "}
              {selected.size === 1 ? "course" : "courses"} and arm the gate?
            </p>
            <Button
              variant="destructive"
              disabled={publish.isPending}
              onClick={() =>
                publish.mutate({
                  courseIds: [...selected],
                  // Only ever forced when the admin has selected a course
                  // whose blockers are on screen above.
                  ...(selectedBlocked.length > 0 ? { force: true } : {}),
                })
              }
            >
              {publish.isPending
                ? "Publishing…"
                : selectedBlocked.length > 0
                  ? "Publish anyway"
                  : "Yes, publish"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

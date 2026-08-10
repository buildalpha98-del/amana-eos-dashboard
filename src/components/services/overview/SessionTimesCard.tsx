"use client";

/**
 * The centre's session times — the windows of care it sells.
 *
 * Modelled on OWNA's Service Info → Session Times, with one deliberate
 * difference: theirs is fifteen fixed slots, most of them empty, and the
 * empty ones are indistinguishable from the used ones until you read the
 * placeholder text. This is a list you add to, so what's on screen is
 * what the centre actually runs.
 *
 * Each row shows its duration, because that number is the one people
 * check — a window typed as 15:00–18:00 when it should be 18:30 looks
 * fine until the duration says 3 hours instead of 3.5.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Plus, Trash2, EyeOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import {
  describeWindowProblem,
  formatDuration,
  formatSessionOfCare,
} from "@/lib/session-times";

interface SessionTime {
  id: string;
  start: string;
  end: string;
  label: string | null;
  active: boolean;
}

const field =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

export function SessionTimesCard({
  serviceId,
  canEdit,
}: {
  serviceId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const key = ["service", serviceId, "session-times"];
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [label, setLabel] = useState("");
  const [showRetired, setShowRetired] = useState(false);

  const { data, isLoading } = useQuery<{ sessionTimes: SessionTime[] }>({
    queryKey: key,
    queryFn: () => fetchApi(`/api/services/${serviceId}/session-times`),
    retry: 1,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: key });
    // The fee editors read this catalogue for their Session of Care
    // dropdown, so a new window has to reach them too.
    qc.invalidateQueries({ queryKey: ["service", serviceId] });
  };

  const add = useMutation({
    mutationFn: (body: { start: string; end: string; label?: string }) =>
      mutateApi(`/api/services/${serviceId}/session-times`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      invalidate();
      setStart("");
      setEnd("");
      setLabel("");
      toast({ description: "Session time added." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; active?: boolean }) =>
      mutateApi(`/api/services/${serviceId}/session-times/${id}`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => invalidate(),
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/services/${serviceId}/session-times/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      invalidate();
      toast({ description: "Session time removed." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  if (isLoading) return <Skeleton className="h-56 w-full rounded-lg" />;

  const all = data?.sessionTimes ?? [];
  const shown = showRetired ? all : all.filter((s) => s.active);
  const retiredCount = all.length - all.filter((s) => s.active).length;

  // Validated live so the Add button can't be pressed into a 400, using
  // the same function the API uses to produce the message.
  const problem = start || end ? describeWindowProblem(start, end) : null;
  const canAdd = !problem && !add.isPending;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-brand" />
          Session times
        </h3>
        <p className="text-xs text-muted mt-0.5">
          The windows of care this centre runs. Fees in every room pick one
          of these as their session of care, so the hours are set once here
          rather than retyped per room.
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted">
          No session times yet. Add the windows this centre runs — a
          before-school session, an after-school session, a vacation-care
          day.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {shown.map((s) => (
            <li
              key={s.id}
              className={`flex items-center gap-3 px-3 py-2.5 ${
                s.active ? "" : "opacity-60"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">
                  {s.label?.trim() && (
                    <span className="font-medium">{s.label.trim()} · </span>
                  )}
                  {formatSessionOfCare(s.start, s.end)}
                  {!s.active && (
                    <span className="ml-2 text-2xs text-muted">(retired)</span>
                  )}
                </p>
                <p className="text-2xs text-muted">
                  Duration: {formatDuration(s.start, s.end) ?? "—"}
                </p>
              </div>

              {canEdit && (
                <>
                  <button
                    type="button"
                    aria-label={
                      s.active
                        ? `Retire ${formatSessionOfCare(s.start, s.end)}`
                        : `Restore ${formatSessionOfCare(s.start, s.end)}`
                    }
                    title={
                      s.active
                        ? "Retire — hides it from new fees, leaves existing ones alone"
                        : "Restore"
                    }
                    onClick={() =>
                      update.mutate({ id: s.id, active: !s.active })
                    }
                    className="p-2 rounded-lg text-muted hover:bg-surface transition-colors"
                  >
                    {s.active ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${formatSessionOfCare(s.start, s.end)}`}
                    onClick={() => remove.mutate(s.id)}
                    className="p-2 rounded-lg text-muted hover:text-red-600 hover:bg-surface transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {retiredCount > 0 && (
        <button
          type="button"
          onClick={() => setShowRetired((v) => !v)}
          className="text-xs text-brand hover:underline"
        >
          {showRetired
            ? "Hide retired"
            : `Show ${retiredCount} retired`}
        </button>
      )}

      {canEdit && (
        <div className="border-t border-border pt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-3">
              <label
                htmlFor="session-time-start"
                className="block text-xs font-medium text-muted mb-1"
              >
                From
              </label>
              <input
                id="session-time-start"
                type="time"
                className={field}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="sm:col-span-3">
              <label
                htmlFor="session-time-end"
                className="block text-xs font-medium text-muted mb-1"
              >
                To
              </label>
              <input
                id="session-time-end"
                type="time"
                className={field}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
            <div className="sm:col-span-4">
              <label
                htmlFor="session-time-label"
                className="block text-xs font-medium text-muted mb-1"
              >
                Name (optional)
              </label>
              <input
                id="session-time-label"
                className={field}
                maxLength={60}
                placeholder="e.g. Ramadan Care"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2 flex items-end">
              <Button
                className="w-full"
                disabled={!canAdd}
                onClick={() =>
                  add.mutate({
                    start,
                    end,
                    ...(label.trim() ? { label: label.trim() } : {}),
                  })
                }
              >
                <Plus className="w-4 h-4" />
                Add
              </Button>
            </div>
          </div>

          {problem ? (
            <p className="text-xs text-red-600">{problem}</p>
          ) : (
            start &&
            end && (
              <p className="text-xs text-muted">
                Duration: {formatDuration(start, end)}
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}

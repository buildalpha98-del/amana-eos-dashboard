"use client";

/**
 * MyQuietHoursCard — staff-facing card for setting their own
 * right-to-disconnect preferences. Lives on My Portal under the
 * profile / contracts area.
 *
 * Why this exists: Fair Work Act s333M (in force Aug 2024) gives
 * employees the right to refuse unreasonable after-hours contact.
 * Capturing each employee's stated quiet hours documents the
 * preference — useful if there's ever a dispute about whether the
 * contact was reasonable.
 *
 * V1 caveat: messaging system enforcement is NOT wired (would touch
 * too many files in one PR). The card is informative — surfaces to
 * admin on the staff profile so they know when to think twice before
 * pinging at 9pm.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Moon, Loader2, CheckCircle2 } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

interface QuietHoursState {
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  quietHoursNotes: string | null;
}

export function MyQuietHoursCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<QuietHoursState>({
    queryKey: ["my-quiet-hours"],
    queryFn: () => fetchApi("/api/my-portal/quiet-hours"),
    staleTime: 60_000,
  });

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [dirty, setDirty] = useState(false);

  // Seed once the data lands.
  useEffect(() => {
    if (data) {
      setStart(data.quietHoursStart ?? "");
      setEnd(data.quietHoursEnd ?? "");
      setNotes(data.quietHoursNotes ?? "");
      setDirty(false);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      mutateApi<QuietHoursState>("/api/my-portal/quiet-hours", {
        method: "PATCH",
        body: {
          quietHoursStart: start || null,
          quietHoursEnd: end || null,
          quietHoursNotes: notes.trim() || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-quiet-hours"] });
      toast({ description: "Quiet hours saved." });
      setDirty(false);
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  // Either-both-or-neither rule (same as the API).
  const bothBlank = !start && !end;
  const bothSet = !!start && !!end;
  const valid = bothBlank || bothSet;
  const canSave = dirty && valid && !save.isPending;

  return (
    <div
      className="bg-card rounded-xl border border-border p-6"
      data-testid="my-quiet-hours-card"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Moon className="w-5 h-5 text-brand" />
          Quiet hours
        </h3>
      </div>

      <p className="text-sm text-muted mb-4">
        Tell your managers when you&apos;d prefer not to be contacted about
        work. Under the Fair Work Act&apos;s right-to-disconnect (s333M, Aug
        2024), you can refuse unreasonable after-hours contact — having a
        documented preference makes the conversation easier.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="qh-start"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Quiet from
              </label>
              <input
                id="qh-start"
                type="time"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  setDirty(true);
                }}
                disabled={save.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="qh-end"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Until
              </label>
              <input
                id="qh-end"
                type="time"
                value={end}
                onChange={(e) => {
                  setEnd(e.target.value);
                  setDirty(true);
                }}
                disabled={save.isPending}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </div>
          </div>

          <p className="text-xs text-muted">
            {start && end ? (
              start <= end ? (
                <>
                  Don&apos;t contact me between{" "}
                  <strong>{start}</strong> and <strong>{end}</strong> the same
                  day.
                </>
              ) : (
                <>
                  Don&apos;t contact me from <strong>{start}</strong> until{" "}
                  <strong>{end}</strong> the next morning (overnight).
                </>
              )
            ) : (
              "Leave blank if you don't want to set specific hours."
            )}
          </p>

          {!valid && (
            <p className="text-xs text-red-700">
              Set both fields, or clear both. &ldquo;From only&rdquo; is
              ambiguous.
            </p>
          )}

          <div>
            <label
              htmlFor="qh-notes"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Notes <span className="text-muted font-normal">(optional)</span>
            </label>
            <textarea
              id="qh-notes"
              rows={3}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setDirty(true);
              }}
              disabled={save.isPending}
              maxLength={2_000}
              placeholder="e.g. 'No contact on weekends', 'Calls OK for genuine emergencies only', 'I check WhatsApp once at 8pm'."
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm resize-y"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            {!dirty && data?.quietHoursStart && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Saved
              </span>
            )}
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={!canSave}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 transition-colors disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Save preference
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

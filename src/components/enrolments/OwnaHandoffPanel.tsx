"use client";

/**
 * OWNA handoff checklist on an enrolment (redesigned 20 Oct 2026, Daniel):
 * a real tick box per step, one Notes box, and "First sessions confirmed" as
 * either a first booked day or "casual bookings only". Ticking the
 * invitation or first-day step can email the family (opt-out per tick).
 */
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import {
  HANDOFF_STEPS,
  handoffIsStale,
  handoffSummary,
  type HandoffPatch,
  type HandoffState,
  type HandoffStep,
} from "@/lib/owna-handoff";

type Response = {
  assignees: { id: string; name: string | null; role: string }[];
  scope: string;
  revision: number;
  state: HandoffState | null;
  placement: string;
  history: {
    id: string;
    createdAt: string;
    user: { name: string | null };
    details: { action: string; step?: HandoffStep; evidence?: string };
  }[];
};

const STEP_ORDER: HandoffStep[] = ["children", "invitation", "access", "sessions"];
const ACTION_LABELS: Record<string, string> = {
  claim: "took ownership",
  assign: "changed owner",
  release: "cleared owner",
  note: "updated notes",
  complete: "ticked",
  reopen: "unticked",
  reset: "reset the checklist",
};

const formatDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

export function OwnaHandoffPanel({
  id,
  status,
  childrenLabel,
}: {
  id: string;
  status: string;
  childrenLabel: string;
}) {
  const client = useQueryClient();
  const { data: session } = useSession();
  const myId = session?.user?.id;
  // The step being ticked that needs a choice first (invitation / sessions).
  const [pending, setPending] = useState<HandoffStep | null>(null);
  const [mode, setMode] = useState<"sent" | "existing">("sent");
  const [sessionsKind, setSessionsKind] = useState<"date" | "casual">("date");
  const [firstDay, setFirstDay] = useState("");
  const [notifyFamily, setNotifyFamily] = useState(true);
  const [notes, setNotes] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const query = useQuery({
    queryKey: ["owna-handoff", id],
    queryFn: () => fetchApi<Response>(`/api/enrolments/${id}/owna-handoff`),
    retry: 2,
  });
  const mutation = useMutation({
    mutationFn: (patch: Omit<HandoffPatch, "revision">) =>
      mutateApi(`/api/enrolments/${id}/owna-handoff`, {
        method: "PATCH",
        body: { ...patch, revision: query.data!.revision },
      }),
    onSuccess: (_r, patch) => {
      setPending(null);
      setFirstDay("");
      setNotifyFamily(true);
      if (patch.action === "note") setNotes(null);
      setMessage("Saved.");
      client.invalidateQueries({ queryKey: ["owna-handoff", id] });
      client.invalidateQueries({ queryKey: ["enrolments"] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  if (query.isPending)
    return (
      <p role="status" className="text-sm text-muted">
        Loading OWNA handoff…
      </p>
    );
  if (query.isError)
    return (
      <div role="alert" className="text-sm">
        <p>Could not load OWNA handoff: {query.error.message}</p>
        <Button variant="outline" onClick={() => query.refetch()}>
          Retry
        </Button>
      </div>
    );

  const { state, placement, history, assignees } = query.data;
  const stale = handoffIsStale(state, placement);
  const busy = mutation.isPending || query.isFetching;
  const approved = status === "processed";
  const steps = state?.steps ?? {};
  const savedNotes = state?.note ?? "";
  const notesValue = notes ?? savedNotes;

  const ownerId = state?.owner?.id ?? "";
  const ownerOptions =
    state?.owner && !assignees.some((a) => a.id === state.owner!.id)
      ? [{ id: state.owner.id, name: state.owner.name, role: "" }, ...assignees]
      : assignees;
  const setOwner = (ownerId: string) =>
    ownerId
      ? mutation.mutate({ action: "assign", ownerId })
      : mutation.mutate({ action: "release" });

  /** Why a step can't be ticked yet, or null. */
  const blockedBy = (step: HandoffStep): string | null => {
    if (!approved) return "Approve the enrolment first";
    if (stale) return "Reset the checklist first";
    if (step !== "children" && !steps.children) return "Tick “All children entered” first";
    if (step === "access" && !steps.invitation) return "Tick the invitation step first";
    return null;
  };

  const toggle = (step: HandoffStep) => {
    setMessage("");
    if (steps[step]) {
      mutation.mutate({ action: "reopen", step });
      return;
    }
    // These two need a choice before they're ticked.
    if (step === "invitation" || step === "sessions") {
      setPending(pending === step ? null : step);
      return;
    }
    mutation.mutate({ action: "complete", step });
  };

  const confirmPending = () => {
    if (pending === "invitation")
      mutation.mutate({ action: "complete", step: "invitation", mode, notifyFamily });
    if (pending === "sessions")
      mutation.mutate(
        sessionsKind === "casual"
          ? { action: "complete", step: "sessions", casual: true }
          : { action: "complete", step: "sessions", firstDay, notifyFamily },
      );
  };

  const detail = (step: HandoffStep) => {
    const done = steps[step];
    if (!done) return null;
    const bits = [
      `${new Date(done.at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })} by ${done.by.name}`,
      done.mode === "existing" ? "Already had OWNA" : done.mode === "sent" ? "Invitation sent" : null,
      done.firstDay ? `First day ${formatDay(done.firstDay)}` : null,
      done.casual ? "Casual bookings only" : null,
    ].filter(Boolean);
    return bits.join(" · ");
  };

  return (
    <section
      aria-labelledby="owna-handoff-heading"
      className="rounded-xl border border-border bg-card p-4 space-y-4"
    >
      <div>
        <h3 id="owna-handoff-heading" className="font-semibold text-foreground">
          OWNA handoff
        </h3>
        <p className="text-sm font-medium text-brand">
          {handoffSummary(state, placement, status)}
        </p>
        <p className="text-sm mt-2">
          For: <strong>{query.data.scope || childrenLabel}</strong>
        </p>
        <p className="text-xs text-muted mt-1">
          Do each step in OWNA, then tick it here. This doesn&apos;t change
          OWNA itself.
        </p>
      </div>

      {!approved && (
        <p className="rounded-lg bg-surface p-3 text-sm">
          This enrolment is still <strong>awaiting approval</strong>. You can
          choose the owner and add notes now. The tick boxes open once the
          enrolment is approved and the children are placed at their centre.
        </p>
      )}

      <div className="space-y-1">
        <label htmlFor="handoff-owner" className="block text-sm font-medium">
          Owner
        </label>
        <select
          id="handoff-owner"
          value={ownerId}
          disabled={busy || stale}
          onChange={(e) => setOwner(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-border bg-background p-2 text-sm"
        >
          <option value="">Unassigned</option>
          {ownerOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name ?? "Staff member"}
              {a.id === myId ? " (me)" : ""}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted">
          The person setting this family up in OWNA. Ticking a step with no
          owner makes you the owner.
        </p>
      </div>

      {stale && (
        <div role="alert" className="rounded-lg bg-surface p-3 text-sm space-y-2">
          <p className="font-medium">
            The enrolment, children or centre changed since these were ticked,
            so the checklist needs redoing.
          </p>
          <Button size="sm" disabled={busy} onClick={() => mutation.mutate({ action: "reset" })}>
            Reset the checklist
          </Button>
        </div>
      )}

      <ul className="space-y-1">
        {STEP_ORDER.map((step) => {
          const done = !!steps[step] && !stale;
          const blocked = done ? null : blockedBy(step);
          const open = pending === step;
          return (
            <li key={step} className="rounded-lg border-b border-border py-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 accent-[var(--color-brand)]"
                  checked={done || open}
                  disabled={busy || !!blocked}
                  onChange={() => toggle(step)}
                />
                <span className="min-w-0">
                  <span className={`block text-sm font-medium ${done ? "text-foreground" : ""}`}>
                    {HANDOFF_STEPS[step]}
                  </span>
                  {done && <span className="block text-xs text-muted">{detail(step)}</span>}
                  {!done && blocked && approved && (
                    <span className="block text-xs text-muted">{blocked}</span>
                  )}
                </span>
              </label>

              {open && step === "invitation" && (
                <div className="ml-8 mt-2 space-y-2 rounded-lg bg-surface p-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={mode === "sent"} onChange={() => setMode("sent")} />
                    OWNA invitation sent
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} />
                    Family already has OWNA
                  </label>
                  <EmailFamily
                    checked={notifyFamily}
                    onChange={setNotifyFamily}
                    hint={
                      mode === "existing"
                        ? "“You're all set in OWNA — sign in as usual.”"
                        : "A step-by-step guide to getting into OWNA. If they haven't got in after 3 days, they get a nudge and you get an alert."
                    }
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={confirmPending}>
                      Tick it
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {open && step === "sessions" && (
                <div className="ml-8 mt-2 space-y-2 rounded-lg bg-surface p-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={sessionsKind === "date"}
                      onChange={() => setSessionsKind("date")}
                    />
                    First day booked
                  </label>
                  {sessionsKind === "date" && (
                    <div className="ml-6 space-y-2">
                      <input
                        type="date"
                        aria-label="First booked day"
                        value={firstDay}
                        onChange={(e) => setFirstDay(e.target.value)}
                        className="rounded-lg border border-border bg-background p-2 text-sm"
                      />
                      <EmailFamily
                        checked={notifyFamily}
                        onChange={setNotifyFamily}
                        hint="“You're booked in!” with the first day, session times, where to find us, the centre's phone and what to expect. The day-before reminder and first-week check-ins are timed from this date."
                      />
                    </div>
                  )}
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={sessionsKind === "casual"}
                      onChange={() => setSessionsKind("casual")}
                    />
                    Casual bookings only
                  </label>
                  {sessionsKind === "casual" && (
                    <p className="ml-6 text-xs text-muted">
                      No first-day email. The family won&apos;t get the
                      &ldquo;anything stopping you starting?&rdquo; check-in either.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy || (sessionsKind === "date" && !firstDay)}
                      onClick={confirmPending}
                    >
                      Tick it
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="handoff-notes">
          Notes
        </label>
        <textarea
          id="handoff-notes"
          maxLength={1000}
          rows={3}
          value={notesValue}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-border bg-background p-2 text-sm"
          placeholder="e.g. Invite sent 20 Oct, mum to check junk folder; waiting on second child's booking days"
        />
        <p className="text-xs text-muted">
          No passwords, PINs or medical details.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || notesValue === savedNotes}
            onClick={() => mutation.mutate({ action: "note", evidence: notesValue })}
          >
            Save notes
          </Button>
          <p role="status" className="text-sm">
            {message}
          </p>
        </div>
      </div>

      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Recent activity
        </summary>
        <ul className="mt-2 space-y-2 text-xs text-muted">
          {history.length === 0 && <li>Nothing recorded yet.</li>}
          {history.map((h) => (
            <li key={h.id} className="break-words">
              {new Date(h.createdAt).toLocaleString("en-AU")} ·{" "}
              {h.user.name ?? "Staff member"}{" "}
              {ACTION_LABELS[h.details.action] ?? h.details.action}
              {h.details.step ? ` “${HANDOFF_STEPS[h.details.step]}”` : ""}
              {h.details.evidence ? ` — ${h.details.evidence}` : ""}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function EmailFamily({
  checked,
  onChange,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  hint: string;
}) {
  return (
    <label className="flex items-start gap-2">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        Email the family
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}

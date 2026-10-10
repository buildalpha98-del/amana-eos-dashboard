"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import {
  HANDOFF_STEPS,
  handoffSummary,
  type HandoffPatch,
  type HandoffState,
  type HandoffStep,
} from "@/lib/owna-handoff";

type Response = {
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
  const [evidence, setEvidence] = useState("");
  const [step, setStep] = useState<HandoffStep>("children");
  const [mode, setMode] = useState<"sent" | "existing">("sent");
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
    onSuccess: () => {
      setEvidence("");
      setMessage("Handoff saved.");
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
  const { state, placement, history } = query.data;
  const stale = !!state && state.placement !== placement;
  const disabled =
    mutation.isPending || query.isFetching || status !== "processed";
  const act = (action: HandoffPatch["action"]) =>
    mutation.mutate({ action, step, evidence, mode });
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
        <p className="text-xs text-muted mt-2">
          Staff checklist only. Saving does not send invitations, update OWNA or
          confirm an enrolment.
        </p>
        <p className="text-sm mt-2">
          Each check covers all children and their assigned services:{" "}
          <strong>{query.data.scope || childrenLabel}</strong>.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <p className="text-sm">
          Owner: <strong>{state?.owner?.name ?? "Unassigned"}</strong>
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || stale}
          onClick={() => act("claim")}
        >
          {state?.owner ? "Take ownership" : "Assign to me"}
        </Button>
        {state?.owner && (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || stale}
            onClick={() => act("release")}
          >
            Release owner
          </Button>
        )}
      </div>
      <p className="text-xs text-muted">
        Ownership is a coordination label. Authorised team members can update or
        take over; changes are logged.
      </p>
      {state?.note && (
        <p className="text-sm rounded-lg bg-surface p-3 whitespace-pre-wrap break-words">
          <strong>Next action:</strong> {state.note}
        </p>
      )}
      {stale && (
        <p role="alert" className="text-sm font-medium">
          The enrolment, children or booking preferences changed. Previous
          checks are out of date. Add a reason and reset before checking again.
        </p>
      )}
      <ol className="space-y-3">
        {Object.entries(HANDOFF_STEPS).map(([key, label]) => {
          const done = state?.steps[key as HandoffStep];
          return (
            <li key={key} className="border-b border-border pb-3 text-sm">
              <p className="font-medium">
                {done && !stale ? "✓" : "○"} {label}
              </p>
              {done && (
                <div className="text-xs text-muted mt-1">
                  <p>
                    {stale ? "Previous check: " : "Checked: "}
                    {new Date(done.at).toLocaleString("en-AU")} by{" "}
                    {done.by.name}
                    {done.mode === "existing"
                      ? " · Existing access"
                      : done.mode === "sent"
                        ? " · Invitation sent"
                        : ""}
                  </p>
                  <p className="whitespace-pre-wrap break-words">
                    {done.evidence}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {status !== "processed" && (
        <p className="text-sm">
          Confirm and place the enrolment before recording the OWNA handoff.
        </p>
      )}
      <div className="space-y-2">
        <label className="block text-sm" htmlFor="handoff-step">
          Checklist step
        </label>
        <select
          id="handoff-step"
          value={step}
          onChange={(e) => setStep(e.target.value as HandoffStep)}
          className="w-full rounded-lg border border-border bg-background p-2 text-sm"
        >
          {Object.entries(HANDOFF_STEPS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        {step === "invitation" && (
          <>
            <label className="block text-sm" htmlFor="handoff-mode">
              Access arrangement
            </label>
            <select
              id="handoff-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as "sent" | "existing")}
              className="w-full rounded-lg border border-border bg-background p-2 text-sm"
            >
              <option value="sent">OWNA invitation sent</option>
              <option value="existing">Existing OWNA access confirmed</option>
            </select>
          </>
        )}
        <label className="block text-sm" htmlFor="handoff-evidence">
          Evidence, next action or reason
        </label>
        <textarea
          id="handoff-evidence"
          maxLength={1000}
          rows={3}
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          className="w-full rounded-lg border border-border bg-background p-2 text-sm"
          placeholder="e.g. OWNA email log checked, invitation sent 10 Oct; or waiting for parent to confirm access"
        />
        <p className="text-xs text-muted">
          Record the actual event date and source. No passwords, PINs, medical
          details or copies of family documents. First-session evidence should
          identify each child’s agreed start date.
        </p>
        <div className="flex flex-wrap gap-2">
          {stale ? (
            <Button
              disabled={disabled || !evidence.trim()}
              onClick={() => act("reset")}
            >
              Reset for recheck
            </Button>
          ) : (
            <>
              <Button
                disabled={disabled || !evidence.trim() || !state?.owner}
                onClick={() => act(state?.steps[step] ? "reopen" : "complete")}
              >
                {state?.steps[step] ? "Reopen check" : "Mark checked"}
              </Button>
              <Button
                variant="outline"
                disabled={disabled}
                onClick={() => act("note")}
              >
                Save next action
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => query.refetch()}
          >
            Reload
          </Button>
        </div>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Recent handoff activity
        </summary>
        <ul className="mt-2 space-y-2 text-xs text-muted">
          {history.length === 0 && <li>No checks recorded yet.</li>}
          {history.map((h) => (
            <li key={h.id} className="break-words">
              {new Date(h.createdAt).toLocaleString("en-AU")} ·{" "}
              {h.user.name ?? "Staff member"} · {h.details.action}
              {h.details.step ? `: ${HANDOFF_STEPS[h.details.step]}` : ""}
              {h.details.evidence ? ` — ${h.details.evidence}` : ""}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Latest 30 changes shown. The full audit is retained.
        </p>
      </details>
    </section>
  );
}

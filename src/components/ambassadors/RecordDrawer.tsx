"use client";

import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import {
  useAmbassadorRecord,
  useDeleteSession,
  useQuickSessions,
  useTransitionRecord,
  useUpdateRecord,
} from "@/hooks/useAmbassadors";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "./StatusBadge";

/**
 * Slide-over detail for one ambassador record: attribution (+ conflict
 * resolution), the new-child check, sessions quick entry, tier editing,
 * transition actions, and the full audit trail. Child shown as initials
 * only — full names stay behind the enrolment permissions.
 */
export function RecordDrawer({
  recordId,
  onClose,
}: {
  recordId: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useAmbassadorRecord(recordId);
  const updateRecord = useUpdateRecord();
  const transition = useTransitionRecord();
  const quickSessions = useQuickSessions();
  const deleteSession = useDeleteSession();

  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [newSession, setNewSession] = useState({ date: "", sessionType: "asc", fee: "" });

  const record = data?.record;
  const editable =
    record && (record.status === "logged" || record.status === "rejected");

  const dateFmt = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString("en-AU", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-lg h-full bg-card border-l border-border shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-heading font-semibold text-foreground">
              {record?.childInitials ?? "…"}
            </h2>
            {record && <StatusBadge status={record.status} />}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading || !record ? (
          <div className="p-5 space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="p-5 space-y-6">
            {/* Summary */}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Item label="Centre" value={record.service.name} />
              <Item label="Logged" value={dateFmt(record.createdAt)} />
              <Item
                label="First attendance"
                value={dateFmt(record.firstAttendanceDate)}
              />
              <Item
                label="Paid sessions (28 days)"
                value={`${record.paidSessionsAttended}/4`}
              />
              <Item
                label="Tier"
                value={record.tierAmount ? `$${record.tierAmount}` : "Not set"}
              />
              <Item
                label="Qualified"
                value={record.qualified ? "Yes" : "Not yet"}
              />
            </dl>

            {/* New-child check */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">
                New-child check
              </h3>
              <p className="text-sm text-muted whitespace-pre-line">
                {record.newChildStatus === "new_child"
                  ? "✓ New child"
                  : record.newChildStatus === "existing_child"
                    ? "✗ Existing child — does not qualify"
                    : "? Uncertain — needs your confirmation"}
              </p>
              {record.newChildStatus === "uncertain" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      updateRecord.mutate({ id: recordId, newChildStatus: "new_child" })
                    }
                  >
                    Confirm new child
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      updateRecord.mutate({
                        id: recordId,
                        newChildStatus: "existing_child",
                      })
                    }
                  >
                    Existing child
                  </Button>
                </div>
              )}
            </section>

            {/* Attribution */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Attribution</h3>
              <div className="text-sm text-muted space-y-1">
                {record.refCode && <p>Referral code: {record.refCode}</p>}
                {record.namedEducatorText && (
                  <p>Named on the form: “{record.namedEducatorText}”</p>
                )}
                <p>
                  Credited:{" "}
                  <span className="text-foreground">
                    {record.creditedEducator?.name ?? "Nobody (unattributed)"}
                  </span>
                  {data?.lmsCompleted === false && (
                    <span className="ml-2 text-2xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                      Ambassadors course incomplete
                    </span>
                  )}
                </p>
              </div>
              {record.attributionConflict && (
                <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-3 text-sm text-red-900 dark:text-red-200">
                  The referral code and the named educator point to different
                  people. Speak with both, then credit the right person from
                  the enrolment record — or mark it unattributed.
                  <div className="mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateRecord.mutate({ id: recordId, creditedEducatorId: null })
                      }
                    >
                      Mark unattributed
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {/* Sessions per week (tier input) */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">
                Regular sessions per week
              </h3>
              <p className="text-2xs text-muted">
                ≥3 pays $50 · 1–2 pays $30. Editable until verification.
              </p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    disabled={!editable || updateRecord.isPending}
                    onClick={() =>
                      updateRecord.mutate({ id: recordId, regularSessionsPerWeek: n })
                    }
                    className={`w-9 h-9 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 ${
                      record.regularSessionsPerWeek === n
                        ? "bg-brand text-white border-brand"
                        : "bg-card text-foreground border-border hover:border-brand"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </section>

            {/* Sessions */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">
                Paid sessions ($0 = free first session, never counts)
              </h3>
              {record.sessions.length > 0 && (
                <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                  {record.sessions.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span className="text-foreground">
                        {dateFmt(s.date)}{" "}
                        <span className="text-muted uppercase text-2xs">
                          {s.sessionType}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span
                          className={
                            s.fee > 0 ? "text-foreground" : "text-muted line-through"
                          }
                        >
                          ${s.fee.toFixed(2)}
                        </span>
                        <span className="text-2xs text-muted">{s.source}</span>
                        {editable && (
                          <button
                            aria-label="Delete session"
                            onClick={() =>
                              deleteSession.mutate({ id: recordId, sessionId: s.id })
                            }
                            className="text-muted hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {editable && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-2xs text-muted">
                    Date
                    <input
                      type="date"
                      value={newSession.date}
                      onChange={(e) =>
                        setNewSession((s) => ({ ...s, date: e.target.value }))
                      }
                      className="block mt-0.5 px-2 py-1.5 border border-border rounded-lg text-sm bg-card text-foreground"
                    />
                  </label>
                  <label className="text-2xs text-muted">
                    Session
                    <select
                      value={newSession.sessionType}
                      onChange={(e) =>
                        setNewSession((s) => ({ ...s, sessionType: e.target.value }))
                      }
                      className="block mt-0.5 px-2 py-1.5 border border-border rounded-lg text-sm bg-card text-foreground"
                    >
                      <option value="bsc">BSC</option>
                      <option value="asc">ASC</option>
                      <option value="vc">VC</option>
                    </select>
                  </label>
                  <label className="text-2xs text-muted">
                    Fee ($)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={newSession.fee}
                      onChange={(e) =>
                        setNewSession((s) => ({ ...s, fee: e.target.value }))
                      }
                      className="block mt-0.5 w-24 px-2 py-1.5 border border-border rounded-lg text-sm bg-card text-foreground"
                    />
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !newSession.date || newSession.fee === "" || quickSessions.isPending
                    }
                    onClick={() => {
                      quickSessions.mutate({
                        id: recordId,
                        sessions: [
                          {
                            date: newSession.date,
                            sessionType: newSession.sessionType,
                            fee: Number(newSession.fee),
                          },
                        ],
                      });
                      setNewSession({ date: "", sessionType: "asc", fee: "" });
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </Button>
                </div>
              )}
            </section>

            {/* Actions */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Actions</h3>
              <div className="flex flex-wrap gap-2">
                {record.status === "logged" && (
                  <Button
                    size="sm"
                    disabled={transition.isPending}
                    onClick={() =>
                      transition.mutate({ id: recordId, to: "director_verified" })
                    }
                  >
                    Verify
                  </Button>
                )}
                {record.status === "director_verified" && (
                  <>
                    <Button
                      size="sm"
                      disabled={transition.isPending}
                      onClick={() =>
                        transition.mutate({ id: recordId, to: "sm_approved" })
                      }
                    >
                      Approve (SM)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={transition.isPending}
                      onClick={() => transition.mutate({ id: recordId, to: "logged" })}
                    >
                      Back to logged
                    </Button>
                  </>
                )}
                {record.status === "rejected" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={transition.isPending}
                    onClick={() => transition.mutate({ id: recordId, to: "logged" })}
                  >
                    Reopen
                  </Button>
                )}
                {record.status !== "rejected" &&
                  record.status !== "paid" &&
                  record.status !== "sent_to_payroll" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setShowReject((s) => !s)}
                    >
                      Reject…
                    </Button>
                  )}
              </div>
              {showReject && (
                <div className="flex gap-2 items-start">
                  <input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason (required)"
                    className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-card text-foreground"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!rejectReason.trim() || transition.isPending}
                    onClick={() => {
                      transition.mutate({
                        id: recordId,
                        to: "rejected",
                        reason: rejectReason.trim(),
                      });
                      setShowReject(false);
                      setRejectReason("");
                    }}
                  >
                    Confirm
                  </Button>
                </div>
              )}
            </section>

            {/* Audit trail */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">History</h3>
              {record.transitions.length === 0 ? (
                <p className="text-sm text-muted">No transitions yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {record.transitions.map((t) => (
                    <li key={t.id} className="text-2xs text-muted">
                      <span className="text-foreground">
                        {t.fromStatus.replace(/_/g, " ")} →{" "}
                        {t.toStatus.replace(/_/g, " ")}
                      </span>{" "}
                      by {t.actor?.name ?? "system"} ·{" "}
                      {new Date(t.createdAt).toLocaleString("en-AU", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {t.reason && ` — “${t.reason}”`}
                    </li>
                  ))}
                </ul>
              )}
              {record.rejectionReason && (
                <p className="text-sm text-red-700 dark:text-red-300">
                  Rejected: {record.rejectionReason}
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-foreground mt-0.5">{value}</dd>
    </div>
  );
}

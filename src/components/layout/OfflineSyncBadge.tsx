"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { offlineQueue, type QueuedMutation } from "@/lib/offline-queue";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/Dialog";
import { SERVICE_TZ } from "@/lib/timezone";

function actionLabel(row: QueuedMutation) {
  if (row.url === "/api/attendance/roll-call") {
    const labels: Record<string, string> = {
      sign_in: "Child arrival",
      sign_out: "Child collection",
      mark_absent: "Child absence",
      undo: "Attendance reset",
      note: "Attendance note",
    };
    return labels[String(row.body.action)] ?? "Attendance update";
  }
  if (row.url.endsWith("/medications")) return "Medication record";
  if (row.url.endsWith("/observations")) return "Observation";
  if (row.url.endsWith("/reflections")) return "Reflection";
  return "Saved action";
}

export function OfflineSyncBadge() {
  const { data: session } = useSession();
  const ownerId = session?.user?.id;
  const currentOwner = useRef(ownerId);
  currentOwner.current = ownerId;
  const [rows, setRows] = useState<QueuedMutation[]>([]);
  const [legacy, setLegacy] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<{
    id: string;
    action: "retry" | "discard";
  } | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    setRows([]);
    setLegacy(0);
    setBusy(false);
    setOpen(false);
    setReview(null);
    setChecked(false);
    setError(null);
    const refresh = () => {
      offlineQueue
        .all()
        .then((all) => {
          if (!active) return;
          setRows(
            ownerId
              ? all
                  .filter((r) => r.ownerId === ownerId)
                  .sort((a, b) => a.enqueuedAt - b.enqueuedAt)
              : [],
          );
          setLegacy(ownerId ? all.filter((r) => !r.ownerId).length : 0);
        })
        .catch(() => {
          if (active) setError("Could not read saved work. Please try again.");
        });
    };
    const unsubscribe = offlineQueue.subscribe(refresh, ownerId ?? null);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [ownerId]);

  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await task();
      if (currentOwner.current === ownerId) {
        setReview(null);
        setChecked(false);
      }
    } catch (err) {
      if (currentOwner.current === ownerId)
        setError(
          err instanceof Error ? err.message : "Could not update saved work.",
        );
    } finally {
      if (currentOwner.current === ownerId) setBusy(false);
    }
  }

  const ownedRows = rows.filter((row) => row.ownerId === ownerId);
  if (!ownerId || (!ownedRows.length && !legacy && !open && !error))
    return null;
  const failed = ownedRows.filter((r) => r.status === "failed").length;
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-label="Review offline saves"
      >
        {failed || legacy
          ? `${failed + legacy} saves need review`
          : `${ownedRows.length} saves pending`}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogTitle className="text-lg font-heading text-brand">
            Saved work on this device
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm text-muted">
            Your actions sync in order. If one fails, later actions wait. Check
            the centre record before retrying or removing a failed save.
          </DialogDescription>
          {error && (
            <p role="alert" className="mt-3 text-sm text-foreground">
              {error}
            </p>
          )}
          {legacy > 0 && (
            <p className="mt-3 rounded-lg bg-surface p-3 text-sm text-foreground">
              {legacy} older saves have no recorded account. They are kept on
              this device and will not sync automatically. Ask your Coordinator
              to review them.
            </p>
          )}
          <div className="mt-4 space-y-3">
            {ownedRows.map((row) => (
              <section
                key={row.id}
                className="rounded-lg border border-border p-3"
              >
                <h3 className="font-semibold text-foreground">
                  {actionLabel(row)}
                </h3>
                <p className="text-sm text-muted">
                  Saved{" "}
                  {new Intl.DateTimeFormat("en-AU", {
                    timeZone: SERVICE_TZ,
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(row.enqueuedAt))}{" "}
                  · {row.attempts} attempts
                </p>
                {typeof row.body.childId === "string" && (
                  <p className="break-all text-sm text-muted">
                    Child reference: {row.body.childId} ·{" "}
                    <Link
                      className="inline-flex min-h-11 items-center text-brand underline"
                      href={`/children/${encodeURIComponent(row.body.childId)}`}
                    >
                      Open child record
                    </Link>
                  </p>
                )}
                <p className="mt-1 text-sm text-foreground">
                  {row.lastError ?? "Waiting to sync"}
                </p>
                {row.status === "failed" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setReview({ id: row.id, action: "retry" });
                        setChecked(false);
                      }}
                    >
                      Review retry
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setReview({ id: row.id, action: "discard" });
                        setChecked(false);
                      }}
                    >
                      Remove saved copy
                    </Button>
                  </div>
                )}
              </section>
            ))}
            {!ownedRows.length && (
              <p className="text-sm text-muted">
                No pending saves for your account.
              </p>
            )}
          </div>
          {review && (
            <div className="mt-4 rounded-lg border border-border bg-surface p-3">
              <p className="text-sm text-foreground">
                {review.action === "retry"
                  ? "Retry sends the same saved details again. A previous request may already have reached the server."
                  : "Removing this device's copy does not change the server record. Later saved actions may depend on this one."}
              </p>
              <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                />
                I checked the centre record and any later actions.
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  disabled={!checked || busy}
                  onClick={() =>
                    run(() =>
                      offlineQueue.review(review.id, ownerId, review.action),
                    )
                  }
                >
                  {review.action === "retry"
                    ? "Allow retry"
                    : "Remove saved copy"}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setReview(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <Button
            className="mt-4"
            disabled={busy || !!review || !ownedRows.length}
            onClick={() => run(() => offlineQueue.drain())}
          >
            {busy ? "Syncing…" : "Sync pending saves"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

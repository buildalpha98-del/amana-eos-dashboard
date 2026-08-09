"use client";

/**
 * Who is charged at this fee.
 *
 * The "Applied to N" badge in the fees matrix opens this. Before the
 * child↔fee link existed the number couldn't be produced at all: a
 * booking records the child, the date and the ROOM, never which of that
 * room's fees applies, so a room running four fees had no way to say how
 * many children were on each.
 *
 * The panel is where assignment happens, rather than the child's
 * profile, because the question is nearly always asked fee-first — "who
 * is still on last year's rate" — and answering it from thirty child
 * profiles is not answering it.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import type { SessionKey } from "@/lib/service-settings";

interface AssignedChild {
  assignmentId: string;
  childId: string;
  name: string;
  status: string;
  effectiveFrom: string | null;
}

export function FeeAppliedToPanel({
  serviceId,
  sessionType,
  feeTierId,
  feeName,
  roomName,
  canEdit,
  open,
  onClose,
}: {
  serviceId: string;
  sessionType: SessionKey;
  feeTierId: string;
  feeName: string;
  roomName: string;
  canEdit: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState("");

  const listKey = [
    "service",
    serviceId,
    "fee-assignments",
    sessionType,
    feeTierId,
  ];

  const { data, isLoading } = useQuery<{ children: AssignedChild[] }>({
    queryKey: listKey,
    queryFn: () =>
      fetchApi(
        `/api/services/${serviceId}/fee-assignments?sessionType=${sessionType}&feeTierId=${encodeURIComponent(feeTierId)}`,
      ),
    enabled: open,
    retry: 1,
  });

  const { data: pickable } = useQuery<{
    children: Array<{ childId: string; name: string }>;
  }>({
    queryKey: ["service", serviceId, "fee-assignments", "unassigned", sessionType],
    queryFn: () =>
      fetchApi(
        `/api/services/${serviceId}/fee-assignments?sessionType=${sessionType}&unassigned=1`,
      ),
    enabled: open && adding,
    retry: 1,
  });

  /** Both the list and every badge on the page go stale on a change. */
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: listKey });
    qc.invalidateQueries({
      queryKey: ["service", serviceId, "fee-assignments"],
    });
  };

  const assign = useMutation({
    mutationFn: (childId: string) =>
      mutateApi(`/api/services/${serviceId}/fee-assignments`, {
        method: "POST",
        body: { childId, sessionType, feeTierId, feeName },
      }),
    onSuccess: () => {
      invalidate();
      setPicked("");
      setAdding(false);
      toast({ description: `Added to ${feeName}.` });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const unassign = useMutation({
    mutationFn: (assignmentId: string) =>
      mutateApi(
        `/api/services/${serviceId}/fee-assignments?assignmentId=${assignmentId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      invalidate();
      toast({ description: "Removed from this fee." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const children = data?.children ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{feeName}</DialogTitle>
        <p className="text-xs text-muted -mt-2">
          Children charged at this fee in {roomName}.
        </p>

        {isLoading ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : children.length === 0 ? (
          <p className="text-sm text-muted py-4">
            Nobody is on this fee yet.
          </p>
        ) : (
          <ul className="divide-y divide-border max-h-72 overflow-y-auto">
            {children.map((c) => (
              <li
                key={c.assignmentId}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{c.name}</p>
                  {c.status !== "active" && (
                    <p className="text-2xs text-muted">{c.status}</p>
                  )}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Remove ${c.name} from ${feeName}`}
                    onClick={() => unassign.mutate(c.assignmentId)}
                    className="shrink-0 rounded-lg p-2 text-muted hover:bg-surface hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit &&
          (adding ? (
            <div className="flex gap-2 items-end border-t border-border pt-3">
              <div className="flex-1">
                <label
                  htmlFor="fee-assign-child"
                  className="block text-xs font-medium text-muted mb-1"
                >
                  Child
                </label>
                <select
                  id="fee-assign-child"
                  className="w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30"
                  value={picked}
                  onChange={(e) => setPicked(e.target.value)}
                >
                  <option value="">Choose a child…</option>
                  {(pickable?.children ?? []).map((c) => (
                    <option key={c.childId} value={c.childId}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {pickable && pickable.children.length === 0 && (
                  <p className="text-2xs text-muted mt-1">
                    Every active child already has a fee for {roomName}. Move
                    one from its current fee to change it.
                  </p>
                )}
              </div>
              <Button
                disabled={!picked || assign.isPending}
                onClick={() => assign.mutate(picked)}
              >
                Add
              </Button>
              <Button variant="secondary" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="border-t border-border pt-3">
              <Button variant="outline" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" />
                Add a child
              </Button>
            </div>
          ))}
      </DialogContent>
    </Dialog>
  );
}

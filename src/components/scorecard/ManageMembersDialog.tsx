"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, X as XIcon, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import {
  useScorecardMembers,
  useInviteScorecardMember,
  useRemoveScorecardMember,
} from "@/hooks/useScorecards";
import { fetchApi } from "@/lib/fetch-api";

interface UserOption {
  id: string;
  name: string;
  email: string;
}

export interface ManageMembersDialogProps {
  open: boolean;
  onClose: () => void;
  scorecardId: string;
  scorecardTitle: string;
  ownerId: string;
}

export function ManageMembersDialog({
  open,
  onClose,
  scorecardId,
  scorecardTitle,
  ownerId,
}: ManageMembersDialogProps) {
  const members = useScorecardMembers(open ? scorecardId : null);
  const invite = useInviteScorecardMember(scorecardId);
  const remove = useRemoveScorecardMember(scorecardId);
  const [picker, setPicker] = useState("");

  // Reuse the existing /api/users list — same shape used by other
  // person-pickers (BulkInviteModal, etc.).
  const users = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: () => fetchApi<UserOption[]>("/api/users?scope=eos_assignees"),
    enabled: open,
    staleTime: 60_000,
  });

  const memberIds = new Set(
    (members.data?.members ?? []).map((m) => m.user.id),
  );
  const candidates = (users.data ?? []).filter(
    (u) => u.id !== ownerId && !memberIds.has(u.id),
  );

  function submitInvite() {
    if (!picker) return;
    invite.mutate(
      { userId: picker },
      { onSuccess: () => setPicker("") },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogTitle className="text-lg font-semibold text-foreground">
          Members of {scorecardTitle}
        </DialogTitle>
        <p className="text-sm text-muted mt-1">
          Members can view this scorecard and own measurables within
          it. The scorecard owner is always a participant.
        </p>

        <div className="mt-4 flex gap-2">
          <select
            value={picker}
            onChange={(e) => setPicker(e.target.value)}
            className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            data-testid="invite-member-picker"
          >
            <option value="">Select a person to invite…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!picker || invite.isPending}
            onClick={submitInvite}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-sm text-white hover:bg-brand-hover disabled:opacity-50"
            data-testid="invite-member-submit"
          >
            {invite.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" />
            )}
            Invite
          </button>
        </div>

        <div className="mt-5">
          <p className="text-xs font-medium text-foreground/80 uppercase tracking-wide mb-2">
            Current members
          </p>
          {members.isLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (members.data?.members ?? []).length === 0 ? (
            <p className="text-sm text-muted italic">
              No members yet. Invite people above so they can see this scorecard.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {(members.data?.members ?? []).map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  data-testid={`member-row-${m.user.id}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {m.user.name}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {m.user.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove.mutate({ userId: m.user.id })}
                    disabled={remove.isPending}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
                    data-testid={`remove-member-${m.user.id}`}
                  >
                    <XIcon className="h-3 w-3" />
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground/80 hover:bg-surface"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

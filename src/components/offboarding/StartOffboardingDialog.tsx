"use client";

/**
 * StartOffboardingDialog — shared "Start offboarding" flow, opened from
 * the /onboarding Offboarding tab (blank) and from a /team row action
 * (prefilled with that row's user). Picks a user + pack and initiates
 * via useInitiateOffboarding; packId is optional — when left on "auto"
 * the server picks the pack matching the user's employment type.
 *
 * 2026-09-04: introduced (Staff Portal v2 Phase 4, Task 4.1/4.2).
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, UserX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";
import { fetchApi } from "@/lib/fetch-api";
import { cn } from "@/lib/utils";
import {
  useInitiateOffboarding,
  useOffboardingPacks,
} from "@/hooks/useOffboarding";
import { ROLE_DISPLAY_NAMES } from "@/lib/role-permissions";
import type { Role } from "@prisma/client";

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface StartOffboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set (e.g. from a /team row), the user picker is skipped. */
  prefillUser?: { id: string; name: string } | null;
}

export function StartOffboardingDialog({
  open,
  onOpenChange,
  prefillUser = null,
}: StartOffboardingDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>(
    prefillUser?.id ?? "",
  );
  const [packId, setPackId] = useState(""); // "" = auto-select by employment type
  const [lastDay, setLastDay] = useState("");
  const [reason, setReason] = useState("");

  // Reset the form each time the dialog opens (and re-apply the prefill).
  // Render-phase "adjust state on prop change" pattern — no effect needed.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSearch("");
      setSelectedUserId(prefillUser?.id ?? "");
      setPackId("");
      setLastDay("");
      setReason("");
    }
  }

  const {
    data: users = [],
    isLoading: usersLoading,
    error: usersError,
  } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: () => fetchApi<UserOption[]>("/api/users"),
    enabled: open && !prefillUser,
    retry: 2,
    staleTime: 30_000,
  });

  const {
    data: packs = [],
    isLoading: packsLoading,
    error: packsError,
  } = useOffboardingPacks();

  const initiate = useInitiateOffboarding();

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  const selectedUser =
    prefillUser ?? users.find((u) => u.id === selectedUserId) ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserId) return;
    try {
      await initiate.mutateAsync({
        userId: selectedUserId,
        packId: packId || undefined,
        lastDay: lastDay || undefined,
        reason: reason.trim() || undefined,
      });
      toast({
        description: `Offboarding started for ${selectedUser?.name ?? "staff member"}.`,
        href: `/staff/${selectedUserId}`,
        hrefLabel: "View their profile",
      });
      onOpenChange(false);
    } catch {
      // Error toast handled by the mutation's onError.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
          <UserX className="w-5 h-5 text-brand" aria-hidden="true" />
          Start offboarding
        </DialogTitle>
        <DialogDescription className="text-sm text-muted mt-1">
          Assigns an offboarding pack so nothing is missed when a staff member
          leaves. Leave the pack on auto to match their employment type.
        </DialogDescription>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* ── Staff member ─────────────────────────────────── */}
          {prefillUser ? (
            <div>
              <p className="block text-sm font-medium text-foreground/80 mb-1">
                Staff member
              </p>
              <p className="px-3 py-2 border border-border rounded-lg text-sm bg-surface text-foreground">
                {prefillUser.name}
              </p>
            </div>
          ) : (
            <div>
              <label
                htmlFor="offboard-user-search"
                className="block text-sm font-medium text-foreground/80 mb-1"
              >
                Staff member *
              </label>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
                  aria-hidden="true"
                />
                <input
                  id="offboard-user-search"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email…"
                  className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div className="mt-2 max-h-44 overflow-y-auto border border-border rounded-lg p-1 space-y-0.5">
                {usersLoading ? (
                  <p className="flex items-center gap-2 text-sm text-muted p-2">
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    Loading staff…
                  </p>
                ) : usersError ? (
                  <p className="text-sm text-red-700 dark:text-red-300 p-2">
                    Couldn&apos;t load the staff list. Close and try again.
                  </p>
                ) : filteredUsers.length === 0 ? (
                  <p className="text-sm text-muted italic p-2">
                    No staff match &ldquo;{search}&rdquo;.
                  </p>
                ) : (
                  filteredUsers.map((u) => (
                    <label
                      key={u.id}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-surface",
                        selectedUserId === u.id && "bg-brand/10",
                      )}
                    >
                      <input
                        type="radio"
                        name="offboard-user"
                        value={u.id}
                        checked={selectedUserId === u.id}
                        onChange={() => setSelectedUserId(u.id)}
                        className="border-border text-brand focus:ring-brand"
                      />
                      <span className="text-sm text-foreground truncate">
                        {u.name}
                      </span>
                      <span className="text-xs text-muted truncate">
                        {ROLE_DISPLAY_NAMES[u.role as Role] ?? u.role}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── Pack ─────────────────────────────────────────── */}
          <div>
            <label
              htmlFor="offboard-pack"
              className="block text-sm font-medium text-foreground/80 mb-1"
            >
              Offboarding pack
            </label>
            {packsError ? (
              <p className="text-sm text-red-700 dark:text-red-300">
                Couldn&apos;t load packs — auto-select will still work.
              </p>
            ) : (
              <select
                id="offboard-pack"
                value={packId}
                onChange={(e) => setPackId(e.target.value)}
                disabled={packsLoading}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
              >
                <option value="">
                  {packsLoading
                    ? "Loading packs…"
                    : "Auto — match employment type"}
                </option>
                {packs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p._count.tasks} tasks)
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* ── Last day + reason ────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="offboard-last-day"
                className="block text-sm font-medium text-foreground/80 mb-1"
              >
                Last working day
              </label>
              <input
                id="offboard-last-day"
                type="date"
                value={lastDay}
                onChange={(e) => setLastDay(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label
                htmlFor="offboard-reason"
                className="block text-sm font-medium text-foreground/80 mb-1"
              >
                Reason
              </label>
              <input
                id="offboard-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="E.g. resignation"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          {initiate.isError ? (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {(initiate.error as Error).message}
            </div>
          ) : null}

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={initiate.isPending}
              disabled={!selectedUserId}
            >
              Start offboarding
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

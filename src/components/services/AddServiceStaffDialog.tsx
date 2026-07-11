"use client";

import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { useAddServiceStaff, type ServiceAccessLevel } from "@/hooks/useServiceStaff";
import { StaffAvatar } from "@/components/staff/StaffAvatar";

interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  role: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AddServiceStaffDialog({
  serviceId,
  excludeUserIds,
  onClose,
}: {
  serviceId: string;
  excludeUserIds: Set<string>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [roleAtService, setRoleAtService] = useState("");
  const [accessLevel, setAccessLevel] = useState<ServiceAccessLevel>("contributor");
  const [startDate, setStartDate] = useState(todayIso());

  const { data: users = [] } = useQuery<DirectoryUser[]>({
    queryKey: ["users-directory"],
    queryFn: () => fetchApi<DirectoryUser[]>("/api/users?active=true"),
    staleTime: 60_000,
    retry: 2,
  });

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => !excludeUserIds.has(u.id))
      .filter((u) =>
        !q
          ? true
          : u.name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [users, excludeUserIds, query]);

  // Treat the selection as null whenever it disappears from the visible
  // candidate list (e.g. the search query filtered it out). Compute
  // derived state in render rather than syncing it via useEffect.
  const effectiveSelectedId =
    selectedUserId && candidates.find((c) => c.id === selectedUserId)
      ? selectedUserId
      : null;
  const selectedUser = useMemo(
    () => users.find((u) => u.id === effectiveSelectedId) ?? null,
    [users, effectiveSelectedId],
  );

  const add = useAddServiceStaff(serviceId);
  const canSubmit = !!effectiveSelectedId && roleAtService.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit || !effectiveSelectedId) return;
    add.mutate(
      {
        userId: effectiveSelectedId,
        roleAtService: roleAtService.trim(),
        accessLevel,
        startDate,
      },
      {
        onSuccess: () => onClose(),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogTitle className="text-lg font-semibold text-foreground">
          Add staff member
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted">
          Assign an existing user to this service. The staff member&apos;s
          primary service stays the same.
        </DialogDescription>

        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-muted uppercase tracking-wide">
              Choose user
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email…"
                className={cn(
                  "w-full pl-9 pr-3 py-2 text-sm rounded-[var(--radius-sm)]",
                  "border border-[color:var(--color-border)]",
                  "bg-[color:var(--color-cream-soft)]",
                  "focus:outline-none focus:ring-2 focus:ring-[color:var(--color-brand)]",
                )}
              />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-cream-soft)]">
              {candidates.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted">
                  No matching users. All matches are already assigned to this
                  service.
                </p>
              ) : (
                <ul className="divide-y divide-[color:var(--color-border)]">
                  {candidates.map((u) => {
                    const selected = u.id === effectiveSelectedId;
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedUserId(u.id)}
                          className={cn(
                            "w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-surface/50",
                            selected && "bg-[color:var(--color-brand)]/10",
                          )}
                        >
                          <StaffAvatar
                            user={{ id: u.id, name: u.name, avatar: u.avatar }}
                            size="sm"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {u.name}
                            </p>
                            <p className="text-xs text-muted truncate">
                              {u.email}
                            </p>
                          </div>
                          {selected ? (
                            <span className="text-2xs font-bold uppercase tracking-wide text-[color:var(--color-brand)]">
                              Selected
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {selectedUser ? (
              <p className="text-xs text-muted">
                Selected: <strong>{selectedUser.name}</strong>
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldLabel label="Role at this service">
              <input
                type="text"
                value={roleAtService}
                onChange={(e) => setRoleAtService(e.target.value)}
                maxLength={50}
                placeholder="Educator, Room Leader, Cook…"
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-cream-soft)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-brand)]"
              />
            </FieldLabel>
            <FieldLabel label="Access level">
              <select
                value={accessLevel}
                onChange={(e) =>
                  setAccessLevel(e.target.value as ServiceAccessLevel)
                }
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-cream-soft)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-brand)]"
              >
                <option value="view_only">View only</option>
                <option value="contributor">Contributor</option>
                <option value="admin">Admin</option>
              </select>
            </FieldLabel>
            <FieldLabel label="Start date">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-cream-soft)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-brand)]"
              />
            </FieldLabel>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={add.isPending}
            className="px-4 py-2 text-sm font-medium text-foreground/80 bg-surface rounded-[var(--radius-sm)] hover:bg-border transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || add.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[color:var(--color-brand)] rounded-[var(--radius-sm)] hover:bg-[color:var(--color-brand-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {add.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Assign to service
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-muted uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}

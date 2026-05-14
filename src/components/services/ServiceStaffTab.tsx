"use client";

/**
 * ServiceStaffTab — per-service staff assignments.
 *
 * Lists primary users (User.serviceId === serviceId) AND additional
 * UserServiceMembership rows in one unified table. Primary rows are
 * read-only with a "Primary" badge — they can't be edited or removed
 * from this UI; that's a transfer flow handled elsewhere.
 *
 * Admin-tier + Director-of-own-service can Add / Edit / Remove
 * additional members. Other roles see read-only.
 */

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Users, Search } from "lucide-react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  useServiceStaff,
  useRemoveServiceStaff,
  type ServiceStaffMember,
} from "@/hooks/useServiceStaff";
import { isAdminRole } from "@/lib/role-permissions";
import { AddServiceStaffDialog } from "./AddServiceStaffDialog";
import { EditServiceStaffDialog } from "./EditServiceStaffDialog";

const ACCESS_LABEL: Record<ServiceStaffMember["membership"]["accessLevel"], string> = {
  view_only: "View only",
  contributor: "Contributor",
  admin: "Admin",
};

export function ServiceStaffTab({ serviceId }: { serviceId: string }) {
  const { data, isLoading } = useServiceStaff(serviceId);
  const { data: session } = useSession();
  const role = session?.user?.role;
  const sessionServiceId = (session?.user as { serviceId?: string | null } | undefined)
    ?.serviceId;
  const canMutate =
    isAdminRole(role) || (role === "member" && sessionServiceId === serviceId);

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceStaffMember | null>(null);
  const [removing, setRemoving] = useState<ServiceStaffMember | null>(null);
  const [search, setSearch] = useState("");

  const remove = useRemoveServiceStaff(serviceId);

  const members = useMemo(() => data?.members ?? [], [data]);
  const existingUserIds = useMemo(
    () => new Set(members.map((m) => m.userId)),
    [members],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.membership.roleAtService.toLowerCase().includes(q),
    );
  }, [members, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-[11px] font-heading font-semibold text-[color:var(--color-muted)] uppercase tracking-[0.08em]">
          Staff at this service{" "}
          <span className="ml-1 text-foreground/60 normal-case tracking-normal">
            ({members.length})
          </span>
        </h2>
        {canMutate ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-sm)]",
              "min-h-[44px]",
              "bg-[color:var(--color-brand)] text-white text-[13px] font-medium",
              "hover:bg-[color:var(--color-brand-hover)] transition-colors",
            )}
          >
            <Plus className="w-4 h-4" />
            Add staff member
          </button>
        ) : null}
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, role, email…"
          className={cn(
            "w-full pl-9 pr-3 py-2 text-sm rounded-[var(--radius-sm)]",
            "border border-[color:var(--color-border)]",
            "bg-[color:var(--color-cream-soft)]",
            "focus:outline-none focus:ring-2 focus:ring-[color:var(--color-brand)]",
          )}
        />
      </div>

      {isLoading ? (
        <div className="text-sm text-[color:var(--color-muted)] py-6">
          Loading staff…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          hasMembers={members.length > 0}
          canAdd={canMutate}
          onAdd={() => setAddOpen(true)}
        />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-cream-soft)]">
          {/* Desktop table */}
          <table className="hidden sm:table w-full text-sm">
            <thead className="bg-[color:var(--color-cream-deep)] text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Name</th>
                <th className="text-left px-4 py-2 font-semibold">Role at service</th>
                <th className="text-left px-4 py-2 font-semibold">Access</th>
                <th className="text-left px-4 py-2 font-semibold">Start date</th>
                {canMutate ? <th className="px-4 py-2 w-16" /> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <StaffTableRow
                  key={m.userId}
                  member={m}
                  canMutate={canMutate}
                  onEdit={() => setEditing(m)}
                  onRemove={() => setRemoving(m)}
                />
              ))}
            </tbody>
          </table>
          {/* Mobile stacked cards */}
          <ul className="sm:hidden divide-y divide-[color:var(--color-border)]">
            {filtered.map((m) => (
              <StaffMobileCard
                key={m.userId}
                member={m}
                canMutate={canMutate}
                onEdit={() => setEditing(m)}
                onRemove={() => setRemoving(m)}
              />
            ))}
          </ul>
        </div>
      )}

      {addOpen ? (
        <AddServiceStaffDialog
          serviceId={serviceId}
          excludeUserIds={existingUserIds}
          onClose={() => setAddOpen(false)}
        />
      ) : null}
      {editing && editing.membership.id ? (
        <EditServiceStaffDialog
          serviceId={serviceId}
          member={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {removing ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemoving(null)}
          title={`Remove ${removing.name}?`}
          description="They'll be removed from this service. Their global profile and other service assignments stay the same. You can re-add them later."
          confirmLabel="Remove"
          variant="danger"
          loading={remove.isPending}
          onConfirm={() => {
            if (!removing.membership.id) {
              setRemoving(null);
              return;
            }
            remove.mutate(
              { membershipId: removing.membership.id },
              { onSettled: () => setRemoving(null) },
            );
          }}
        />
      ) : null}
    </div>
  );
}

function StaffTableRow({
  member,
  canMutate,
  onEdit,
  onRemove,
}: {
  member: ServiceStaffMember;
  canMutate: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const canEditRow = canMutate && !member.isPrimary;
  return (
    <tr className="border-t border-[color:var(--color-border)]">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <StaffAvatar
            user={{ id: member.userId, name: member.name, avatar: member.avatar }}
            size="sm"
          />
          <div>
            <p className="font-medium text-foreground flex items-center gap-1.5">
              {member.name}
              {member.isPrimary ? <PrimaryBadge /> : null}
            </p>
            <p className="text-xs text-muted">{member.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-foreground/80">{member.membership.roleAtService}</td>
      <td className="px-4 py-3 text-foreground/80">
        {ACCESS_LABEL[member.membership.accessLevel]}
      </td>
      <td className="px-4 py-3 text-foreground/80">{member.membership.startDate}</td>
      {canMutate ? (
        <td className="px-4 py-3 text-right">
          {canEditRow ? (
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={onEdit}
                aria-label={`Edit ${member.name}`}
                className="p-2 min-h-[36px] min-w-[36px] rounded-[var(--radius-sm)] text-muted hover:text-foreground hover:bg-surface"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${member.name}`}
                className="p-2 min-h-[36px] min-w-[36px] rounded-[var(--radius-sm)] text-muted hover:text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <span
              className="text-[11px] text-muted"
              title="Manage primary service on the user's profile"
            >
              —
            </span>
          )}
        </td>
      ) : null}
    </tr>
  );
}

function StaffMobileCard({
  member,
  canMutate,
  onEdit,
  onRemove,
}: {
  member: ServiceStaffMember;
  canMutate: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const canEditRow = canMutate && !member.isPrimary;
  return (
    <li className="p-3 flex items-start gap-3">
      <StaffAvatar
        user={{ id: member.userId, name: member.name, avatar: member.avatar }}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground flex items-center gap-1.5 flex-wrap">
          {member.name}
          {member.isPrimary ? <PrimaryBadge /> : null}
        </p>
        <p className="text-xs text-muted truncate">{member.email}</p>
        <div className="mt-1.5 text-[11px] text-foreground/80 space-y-0.5">
          <div>{member.membership.roleAtService}</div>
          <div className="text-muted">
            {ACCESS_LABEL[member.membership.accessLevel]} · since {member.membership.startDate}
          </div>
        </div>
      </div>
      {canEditRow ? (
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${member.name}`}
            className="p-2 min-h-[36px] min-w-[36px] rounded-[var(--radius-sm)] text-muted hover:text-foreground hover:bg-surface"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${member.name}`}
            className="p-2 min-h-[36px] min-w-[36px] rounded-[var(--radius-sm)] text-muted hover:text-rose-600 hover:bg-rose-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ) : null}
    </li>
  );
}

function PrimaryBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide text-emerald-800"
      title="This is the staff member's primary service. Manage on their profile."
    >
      Primary
    </span>
  );
}

function EmptyState({
  hasMembers,
  canAdd,
  onAdd,
}: {
  hasMembers: boolean;
  canAdd: boolean;
  onAdd: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] bg-[color:var(--color-cream-soft)]",
        "border border-dashed border-[color:var(--color-border)] p-8 text-center",
      )}
    >
      <Users className="w-8 h-8 mx-auto text-[color:var(--color-brand)]/60 mb-2" />
      <p className="text-sm font-medium text-[color:var(--color-foreground)]">
        {hasMembers ? "No matches" : "No staff assigned yet"}
      </p>
      <p className="text-xs text-[color:var(--color-muted)] mt-1 mb-4">
        {hasMembers
          ? "Try a different search term."
          : "Add the first staff member to start tracking assignments for this service."}
      </p>
      {canAdd && !hasMembers ? (
        <button
          type="button"
          onClick={onAdd}
          className={cn(
            "inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-sm)]",
            "min-h-[44px]",
            "bg-[color:var(--color-brand)] text-white text-[13px] font-medium",
            "hover:bg-[color:var(--color-brand-hover)] transition-colors",
          )}
        >
          <Plus className="w-4 h-4" />
          Add first staff member
        </button>
      ) : null}
    </div>
  );
}

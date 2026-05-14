"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import {
  useUpdateServiceStaff,
  type ServiceAccessLevel,
  type ServiceMembershipStatus,
  type ServiceStaffMember,
} from "@/hooks/useServiceStaff";

export function EditServiceStaffDialog({
  serviceId,
  member,
  onClose,
}: {
  serviceId: string;
  member: ServiceStaffMember;
  onClose: () => void;
}) {
  const membershipId = member.membership.id;
  const [roleAtService, setRoleAtService] = useState(
    member.membership.roleAtService,
  );
  const [accessLevel, setAccessLevel] = useState<ServiceAccessLevel>(
    member.membership.accessLevel,
  );
  const [startDate, setStartDate] = useState(member.membership.startDate);
  const [endDate, setEndDate] = useState(member.membership.endDate ?? "");
  const [status, setStatus] = useState<ServiceMembershipStatus>(
    member.membership.status,
  );

  const update = useUpdateServiceStaff(serviceId);
  const canSubmit = !!membershipId && roleAtService.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit || !membershipId) return;
    update.mutate(
      {
        membershipId,
        roleAtService: roleAtService.trim(),
        accessLevel,
        startDate,
        endDate: endDate || null,
        status,
      },
      {
        onSuccess: () => onClose(),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogTitle className="text-lg font-semibold text-foreground">
          Edit assignment
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted">
          {member.name}&apos;s role at this service. Changes don&apos;t affect
          the user&apos;s global profile or other service assignments.
        </DialogDescription>

        <div className="mt-4 space-y-3">
          <FieldLabel label="Role at this service">
            <input
              type="text"
              value={roleAtService}
              onChange={(e) => setRoleAtService(e.target.value)}
              maxLength={50}
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-cream-soft)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-brand)]"
            />
          </FieldLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <FieldLabel label="Status">
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as ServiceMembershipStatus)
                }
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-cream-soft)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-brand)]"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
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
            <FieldLabel label="End date (optional)">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-cream-soft)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-brand)]"
              />
            </FieldLabel>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={update.isPending}
            className="px-4 py-2 text-sm font-medium text-foreground/80 bg-surface rounded-[var(--radius-sm)] hover:bg-border transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || update.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[color:var(--color-brand)] rounded-[var(--radius-sm)] hover:bg-[color:var(--color-brand-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save changes
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

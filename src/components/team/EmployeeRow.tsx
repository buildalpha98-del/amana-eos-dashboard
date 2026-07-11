"use client";

/**
 * EmployeeRow — single row in the /team list. Click-through wraps the
 * name cell in a <Link> to /staff/[id]. Marketing viewers' rows are
 * NOT wrapped in <Link> because the server-side `canAccessProfile`
 * returns `false` for marketing.
 *
 * 2026-05-04: introduced for the Teams tab redesign (spec PR #77).
 * 2026-05-06: action-menu wired with quick-actions + resend-invite
 * (Bucket B). The kebab placeholder is replaced with RowActionMenu;
 * item visibility derives from `viewerRole` + `viewerId` vs row.
 */

import Link from "next/link";
import { useState } from "react";
import {
  Pencil,
  Key,
  ListChecks,
  ShieldUser,
  UserX,
  Mail,
  Building2,
  AlertCircle,
} from "lucide-react";
import { ROLE_DISPLAY_NAMES, isAdminRole } from "@/lib/role-permissions";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { StaffTagPills } from "@/components/staff/StaffTagPills";
import { cn } from "@/lib/utils";
import { RowActionMenu, type RowActionItem } from "./RowActionMenu";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  useEmployeeQuickAction,
  type QuickActionType,
} from "@/hooks/useEmployeeQuickAction";
import { useEmployeeResendInvite } from "@/hooks/useEmployeeResendInvite";
import type { EmployeeListItem } from "@/hooks/useEmployeesList";
import { AssignToServiceDialog } from "./AssignToServiceDialog";

const STATUS_TONE: Record<EmployeeListItem["status"], string> = {
  active: "bg-emerald-100 text-emerald-800 border-emerald-300",
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  deactivated: "bg-surface text-foreground/80 border-border",
};

const STATUS_LABEL: Record<EmployeeListItem["status"], string> = {
  active: "Active",
  pending: "Pending",
  deactivated: "Deactivated",
};

export interface EmployeeRowProps {
  employee: EmployeeListItem;
  viewerRole: string;
  viewerId: string;
  /** The current `?…` search string from the list, passed through so
   *  the profile's Previous/Next nav can re-derive the filter state. */
  listSearchString: string;
}

export function EmployeeRow({
  employee,
  viewerRole,
  viewerId,
  listSearchString,
}: EmployeeRowProps) {
  const profileHref = `/staff/${employee.id}${listSearchString}`;
  const roleLabel =
    ROLE_DISPLAY_NAMES[employee.role as keyof typeof ROLE_DISPLAY_NAMES] ??
    employee.role;
  const isClickable = viewerRole !== "marketing";

  const isAdmin = isAdminRole(viewerRole);
  const isOwner = viewerRole === "owner";
  const isSelf = viewerId === employee.id;
  const isPending = employee.status === "pending";

  const quickAction = useEmployeeQuickAction(employee.id);
  const resendInvite = useEmployeeResendInvite(employee.id);
  const [pendingConfirm, setPendingConfirm] = useState<QuickActionType | null>(
    null,
  );
  const [assignOpen, setAssignOpen] = useState(false);

  // Build the items list. Order: edit → reset → resend → onboarding →
  // admin toggle → deactivate. Marketing viewers get no menu at all
  // (the kebab is hidden) since they can't take any action.
  const items: RowActionItem[] = [];

  if (viewerRole !== "marketing") {
    if (isAdmin || isSelf) {
      items.push({
        key: "edit",
        label: "Edit profile",
        icon: <Pencil className="h-3.5 w-3.5" />,
        // Navigation lives on the row's Link; the menu item just
        // mirrors it for discoverability.
        onSelect: () => window.location.assign(profileHref),
      });
    }
    if (isAdmin) {
      items.push({
        key: "reset_password",
        label: "Reset password",
        icon: <Key className="h-3.5 w-3.5" />,
        onSelect: () => quickAction.mutate("reset_password"),
      });
    }
    if (isAdmin && isPending) {
      items.push({
        key: "resend_invite",
        label: "Resend invite",
        icon: <Mail className="h-3.5 w-3.5" />,
        onSelect: () => resendInvite.mutate(),
      });
    }
    if (isAdmin) {
      items.push({
        key: "trigger_onboarding",
        label: "Trigger onboarding",
        icon: <ListChecks className="h-3.5 w-3.5" />,
        onSelect: () => quickAction.mutate("trigger_onboarding"),
      });
    }
    if (isAdmin) {
      items.push({
        key: "assign_service",
        label: "Assign to service…",
        icon: <Building2 className="h-3.5 w-3.5" />,
        onSelect: () => setAssignOpen(true),
      });
    }
    if (isOwner && !isSelf) {
      items.push({
        key: "toggle_admin",
        label: employee.role === "admin" ? "Remove admin" : "Make admin",
        icon: <ShieldUser className="h-3.5 w-3.5" />,
        onSelect: () => setPendingConfirm("toggle_admin"),
      });
    }
    if (isAdmin && !isSelf) {
      items.push({
        key: "toggle_active",
        label: employee.status === "deactivated" ? "Reactivate" : "Deactivate",
        icon: <UserX className="h-3.5 w-3.5" />,
        destructive: employee.status !== "deactivated",
        onSelect: () => setPendingConfirm("toggle_active"),
      });
    }
  }

  const confirmCopy =
    pendingConfirm === "toggle_admin" || pendingConfirm === "toggle_active"
      ? CONFIRM_COPY[pendingConfirm](employee)
      : null;

  function runConfirm() {
    if (!pendingConfirm) return;
    const action = pendingConfirm;
    setPendingConfirm(null);
    quickAction.mutate(action);
  }

  // Red flag for active staff who haven't been linked to their EH
  // Payroll employee record yet. Deactivated users don't need a
  // badge — they're not expected to be on payroll. Pending invites
  // do show it so admin remembers to link them as part of onboarding.
  const needsPayrollLink =
    !employee.payrollLinked && employee.status !== "deactivated";
  // Yellow flag for active staff who don't have any contract on file
  // (active or awaiting signature). Same status gating as the red
  // payroll badge — deactivated users are exempt.
  const needsContract =
    !employee.hasActiveContract && employee.status !== "deactivated";

  const nameInner = (
    <>
      <StaffAvatar
        user={{
          id: employee.id,
          name: employee.name,
          avatar: employee.avatar,
        }}
        size="sm"
      />
      <div>
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          {employee.name}
          {needsPayrollLink ? (
            <span
              role="img"
              aria-label="Not linked to EH Payroll — sync employment ID"
              title="Not linked to EH Payroll — sync this employee's payroll ID so payslips, leave, and expenses work for them"
              data-testid={`payroll-warning-${employee.id}`}
              className="inline-flex items-center"
            >
              <AlertCircle className="h-3.5 w-3.5 text-red-600" />
            </span>
          ) : null}
          {needsContract ? (
            <span
              role="img"
              aria-label="No contract issued — upload or generate one"
              title="No contract on file — open this staff profile and use the Contracts tab to upload an existing one or issue a new one"
              data-testid={`contract-warning-${employee.id}`}
              className="inline-flex items-center"
            >
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            </span>
          ) : null}
        </p>
        {employee.email ? (
          <p className="text-xs text-muted">{employee.email}</p>
        ) : null}
      </div>
    </>
  );

  const nameCell = isClickable ? (
    <Link
      href={profileHref}
      className="flex items-center gap-3 hover:underline focus:outline-none focus:ring-2 focus:ring-brand rounded"
      prefetch={false}
    >
      {nameInner}
    </Link>
  ) : (
    <div className="flex items-center gap-3">{nameInner}</div>
  );

  return (
    <>
      <tr
        className={cn(
          "border-t border-border",
          isClickable && "hover:bg-surface/30 cursor-pointer",
        )}
        data-testid={`employee-row-${employee.id}`}
      >
        <td className="px-4 py-3">{nameCell}</td>
        <td className="px-4 py-3 text-sm text-foreground/80">
          <div className="space-y-1">
            <div>{roleLabel}</div>
            <StaffTagPills tags={employee.tags} max={3} />
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-foreground/80">
          {employee.service?.name ?? "—"}
        </td>
        <td className="px-4 py-3">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0 text-2xs font-bold uppercase tracking-wide",
              STATUS_TONE[employee.status],
            )}
          >
            {STATUS_LABEL[employee.status]}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <RowActionMenu items={items} triggerLabel={`Actions for ${employee.name}`} />
        </td>
      </tr>
      {confirmCopy ? (
        <ConfirmDialog
          open={pendingConfirm !== null}
          onOpenChange={(o) => !o && setPendingConfirm(null)}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirmLabel}
          variant={confirmCopy.variant}
          onConfirm={runConfirm}
          loading={quickAction.isPending}
        />
      ) : null}
      {assignOpen ? (
        <AssignToServiceDialog
          userId={employee.id}
          userName={employee.name}
          onClose={() => setAssignOpen(false)}
        />
      ) : null}
    </>
  );
}

const CONFIRM_COPY: Record<
  Extract<QuickActionType, "toggle_admin" | "toggle_active">,
  (employee: EmployeeListItem) => {
    title: string;
    description: string;
    confirmLabel: string;
    variant: "danger" | "default";
  }
> = {
  toggle_admin: (e) =>
    e.role === "admin"
      ? {
          title: `Remove ${e.name} as admin?`,
          description:
            "They will lose admin permissions immediately. Other access stays the same.",
          confirmLabel: "Remove admin",
          variant: "danger",
        }
      : {
          title: `Make ${e.name} an admin?`,
          description:
            "They will gain full admin permissions across the dashboard immediately.",
          confirmLabel: "Make admin",
          variant: "default",
        },
  toggle_active: (e) =>
    e.status === "deactivated"
      ? {
          title: `Reactivate ${e.name}?`,
          description: "They will be able to sign in again immediately.",
          confirmLabel: "Reactivate",
          variant: "default",
        }
      : {
          title: `Deactivate ${e.name}?`,
          description:
            "They will be unable to sign in. Their data and history are preserved — you can reactivate them later.",
          confirmLabel: "Deactivate",
          variant: "danger",
        },
};

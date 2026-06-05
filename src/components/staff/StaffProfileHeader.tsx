"use client";

/**
 * StaffProfileHeader — top section of the new long-scroll staff
 * profile. Shows avatar + identity + ACTIVE/PENDING/DEACTIVATED
 * badge, a "Quick actions" column wired to
 * /api/employees/[id]/quick-action, and a Back-to-Team strip.
 *
 * 2026-05-04: introduced (spec PR #77).
 * 2026-05-06: quick actions wired (PR 4).
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Mail,
  Phone,
  MapPin,
  Hash,
  Pencil,
  Key,
  ListChecks,
  ShieldUser,
  UserX,
  Loader2,
} from "lucide-react";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { StaffTagEditor } from "@/components/staff/StaffTagEditor";
import { ROLE_DISPLAY_NAMES, isAdminRole } from "@/lib/role-permissions";
import { useEmployeeQuickAction, type QuickActionType } from "@/hooks/useEmployeeQuickAction";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";

export interface StaffProfileHeaderProps {
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
    phone: string | null;
    role: string;
    active: boolean;
    lastLoginAt: Date | null;
    address?: string | null;
    service?: { id: string; name: string } | null;
    tags?: string[];
  };
  tenure: string;
  /** Viewer's role — controls which quick actions render. */
  viewerRole: string;
  /** True when viewer is the user themselves (controls Edit visibility). */
  isSelf: boolean;
  /** The list page URL to return to (preserves filter state). */
  backHref: string;
  /** Previous employee in the same filtered list, or null at the
   *  start / when the current user isn't in the list. */
  prevHref?: string | null;
  /** Next employee in the same filtered list. */
  nextHref?: string | null;
}

function deriveStatus(
  user: StaffProfileHeaderProps["user"],
): "active" | "pending" | "deactivated" {
  if (!user.active) return "deactivated";
  return user.lastLoginAt ? "active" : "pending";
}

const STATUS_TONE: Record<ReturnType<typeof deriveStatus>, string> = {
  active: "bg-emerald-100 text-emerald-800 border-emerald-300",
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  deactivated: "bg-gray-100 text-gray-700 border-gray-300",
};

export function StaffProfileHeader({
  user,
  tenure,
  viewerRole,
  isSelf,
  backHref,
  prevHref,
  nextHref,
}: StaffProfileHeaderProps) {
  const isAdmin = isAdminRole(viewerRole);
  const isOwner = viewerRole === "owner";
  const status = deriveStatus(user);
  const roleLabel =
    ROLE_DISPLAY_NAMES[user.role as Role] ?? user.role;

  const router = useRouter();
  const quickAction = useEmployeeQuickAction(user.id);
  const [pendingConfirm, setPendingConfirm] = useState<QuickActionType | null>(
    null,
  );

  // Edit profile deep-link — switches the Employment records sub-tab to
  // "Personal details" and auto-opens the edit form (PersonalTab reads
  // `?edit=personal` from the URL on mount).
  function handleEditProfile() {
    router.replace(`?edit=personal#section-employment`, { scroll: false });
    // Smooth-scroll after the URL change so the editor lands in the viewport.
    requestAnimationFrame(() => {
      const target = document.getElementById("section-employment");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function runConfirm() {
    if (!pendingConfirm) return;
    const action = pendingConfirm;
    setPendingConfirm(null);
    quickAction.mutate(action);
  }

  const confirmCopy =
    pendingConfirm === "toggle_admin" || pendingConfirm === "toggle_active"
      ? CONFIRM_COPY[pendingConfirm](user)
      : null;

  return (
    <div data-testid="staff-profile-header">
      {/* Top strip: back link + Prev/Next employee buttons so admins
          can page through the filtered team list without bouncing
          back to /team every time. 2026-06-04. */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Team
        </Link>
        <div className="flex items-center gap-2">
          {prevHref ? (
            <Link
              href={prevHref}
              className="inline-flex items-center gap-1 text-sm text-foreground border border-border rounded-md px-3 py-1 hover:bg-surface transition-colors"
              data-testid="staff-prev-employee"
              title="Previous employee in this list"
            >
              <ArrowLeft className="h-4 w-4" />
              Previous
            </Link>
          ) : (
            <span
              className="inline-flex items-center gap-1 text-sm text-muted border border-border/50 rounded-md px-3 py-1 opacity-50 cursor-not-allowed"
              aria-disabled="true"
            >
              <ArrowLeft className="h-4 w-4" />
              Previous
            </span>
          )}
          {nextHref ? (
            <Link
              href={nextHref}
              className="inline-flex items-center gap-1 text-sm text-foreground border border-border rounded-md px-3 py-1 hover:bg-surface transition-colors"
              data-testid="staff-next-employee"
              title="Next employee in this list"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <span
              className="inline-flex items-center gap-1 text-sm text-muted border border-border/50 rounded-md px-3 py-1 opacity-50 cursor-not-allowed"
              aria-disabled="true"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Identity block */}
        <div className="flex-1 flex items-start gap-4">
          <StaffAvatar
            user={{ id: user.id, name: user.name, avatar: user.avatar }}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-foreground">
              {user.name}
            </h1>
            <p className="text-sm text-muted mt-0.5">
              {roleLabel}
              {user.service?.name ? ` · ${user.service.name}` : ""}
              {tenure ? ` · ${tenure}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-bold uppercase tracking-wide",
                  STATUS_TONE[status],
                )}
              >
                {status}
              </span>
              <StaffTagEditor
                userId={user.id}
                tags={user.tags ?? []}
                canEdit={isAdmin}
              />
            </div>

            <dl className="mt-3 space-y-1 text-sm text-foreground/80">
              {user.email ? (
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted" />
                  <span>{user.email}</span>
                </div>
              ) : null}
              {user.phone ? (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted" />
                  <span>{user.phone}</span>
                </div>
              ) : null}
              {user.address ? (
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-muted" />
                  <span>{user.address}</span>
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <Hash className="h-3.5 w-3.5 text-muted" />
                <span>Employee ID: {user.id}</span>
              </div>
            </dl>
          </div>
        </div>

        {/* Quick actions column */}
        {(isAdmin || isSelf || isOwner) && (
          <div
            className="rounded-lg border border-border bg-card p-4 lg:w-64 self-start"
            data-testid="staff-profile-quick-actions"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-3">
              Quick actions
            </p>
            <div className="flex flex-col gap-1.5">
              {(isAdmin || isSelf) && (
                <QuickActionButton
                  icon={<Pencil className="h-4 w-4" />}
                  label="Edit profile"
                  onClick={handleEditProfile}
                  title="Open the personal-details editor"
                  data-action="edit"
                />
              )}
              {isAdmin && (
                <QuickActionButton
                  icon={<Key className="h-4 w-4" />}
                  label="Reset password"
                  loading={
                    quickAction.isPending &&
                    quickAction.variables === "reset_password"
                  }
                  onClick={() => quickAction.mutate("reset_password")}
                  data-action="reset-password"
                />
              )}
              {isAdmin && (
                <QuickActionButton
                  icon={<ListChecks className="h-4 w-4" />}
                  label="Trigger onboarding"
                  loading={
                    quickAction.isPending &&
                    quickAction.variables === "trigger_onboarding"
                  }
                  onClick={() => quickAction.mutate("trigger_onboarding")}
                  data-action="trigger-onboarding"
                />
              )}
              {isOwner && !isSelf && (
                <QuickActionButton
                  icon={<ShieldUser className="h-4 w-4" />}
                  label={
                    user.role === "admin" ? "Remove admin" : "Make admin"
                  }
                  loading={
                    quickAction.isPending &&
                    quickAction.variables === "toggle_admin"
                  }
                  onClick={() => setPendingConfirm("toggle_admin")}
                  data-action="make-admin"
                />
              )}
              {isAdmin && !isSelf && (
                <QuickActionButton
                  icon={<UserX className="h-4 w-4" />}
                  label={user.active ? "Deactivate" : "Reactivate"}
                  variant={user.active ? "destructive" : "default"}
                  loading={
                    quickAction.isPending &&
                    quickAction.variables === "toggle_active"
                  }
                  onClick={() => setPendingConfirm("toggle_active")}
                  data-action="deactivate"
                />
              )}
            </div>
          </div>
        )}
      </div>

      {confirmCopy && (
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
      )}
    </div>
  );
}

const CONFIRM_COPY: Record<
  Extract<QuickActionType, "toggle_admin" | "toggle_active">,
  (user: StaffProfileHeaderProps["user"]) => {
    title: string;
    description: string;
    confirmLabel: string;
    variant: "danger" | "default";
  }
> = {
  toggle_admin: (user) =>
    user.role === "admin"
      ? {
          title: `Remove ${user.name} as admin?`,
          description:
            "They will lose admin permissions immediately. Their other access stays the same.",
          confirmLabel: "Remove admin",
          variant: "danger",
        }
      : {
          title: `Make ${user.name} an admin?`,
          description:
            "They will gain full admin permissions across the dashboard immediately.",
          confirmLabel: "Make admin",
          variant: "default",
        },
  toggle_active: (user) =>
    user.active
      ? {
          title: `Deactivate ${user.name}?`,
          description:
            "They will be unable to sign in. Their data and history are preserved — you can reactivate them later.",
          confirmLabel: "Deactivate",
          variant: "danger",
        }
      : {
          title: `Reactivate ${user.name}?`,
          description: "They will be able to sign in again immediately.",
          confirmLabel: "Reactivate",
          variant: "default",
        },
};

// ── QuickActionButton ───────────────────────────────────────────────

interface QuickActionButtonProps {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  loading?: boolean;
  variant?: "default" | "destructive";
  title?: string;
  "data-action"?: string;
  onClick?: () => void;
}

function QuickActionButton({
  icon,
  label,
  disabled,
  loading,
  variant = "default",
  onClick,
  ...rest
}: QuickActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-left",
        "hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "destructive" && "text-red-700 hover:bg-red-50",
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      <span>{label}</span>
    </button>
  );
}

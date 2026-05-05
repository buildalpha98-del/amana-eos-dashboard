"use client";

/**
 * StaffProfileHeader — top section of the new long-scroll staff
 * profile (PR 3 of the Teams tab redesign). Shows avatar + identity
 * + ACTIVE/PENDING/DEACTIVATED badge, a "Quick actions" column, and
 * a Back-to-Team strip.
 *
 * Quick-action buttons are STUB BUTTONS in this PR — wiring happens
 * in PR 4 against `/api/employees/[id]/quick-action`.
 *
 * 2026-05-04: introduced (spec PR #77).
 */

import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Hash,
  Pencil,
  Key,
  ListChecks,
  ShieldUser,
  UserX,
} from "lucide-react";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { ROLE_DISPLAY_NAMES, isAdminRole } from "@/lib/role-permissions";
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
  };
  tenure: string;
  /** Viewer's role — controls which quick actions render. */
  viewerRole: string;
  /** True when viewer is the user themselves (controls Edit visibility). */
  isSelf: boolean;
  /** The list page URL to return to (preserves filter state). */
  backHref: string;
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
}: StaffProfileHeaderProps) {
  const isAdmin = isAdminRole(viewerRole);
  const isOwner = viewerRole === "owner";
  const status = deriveStatus(user);
  const roleLabel =
    ROLE_DISPLAY_NAMES[user.role as Role] ?? user.role;

  return (
    <div data-testid="staff-profile-header">
      {/* Top strip: back link + (future) Prev/Next employee buttons */}
      <div className="mb-4 flex items-center gap-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Team
        </Link>
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
            <span
              className={cn(
                "mt-2 inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-bold uppercase tracking-wide",
                STATUS_TONE[status],
              )}
            >
              {status}
            </span>

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

        {/* Quick actions column — stubbed for PR 3, wired in PR 4 */}
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
                  disabled
                  data-action="edit"
                />
              )}
              {isAdmin && (
                <QuickActionButton
                  icon={<Key className="h-4 w-4" />}
                  label="Reset password"
                  disabled
                  data-action="reset-password"
                />
              )}
              {isAdmin && (
                <QuickActionButton
                  icon={<ListChecks className="h-4 w-4" />}
                  label="Trigger onboarding"
                  disabled
                  data-action="trigger-onboarding"
                />
              )}
              {isOwner && (
                <QuickActionButton
                  icon={<ShieldUser className="h-4 w-4" />}
                  label={
                    user.role === "admin" ? "Remove admin" : "Make admin"
                  }
                  disabled
                  data-action="make-admin"
                />
              )}
              {isAdmin && !isSelf && (
                <QuickActionButton
                  icon={<UserX className="h-4 w-4" />}
                  label={user.active ? "Deactivate" : "Reactivate"}
                  variant="destructive"
                  disabled
                  data-action="deactivate"
                />
              )}
            </div>
            <p className="text-[10px] text-muted/70 mt-3 italic">
              Coming in next release
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── QuickActionButton ───────────────────────────────────────────────

interface QuickActionButtonProps {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  variant?: "default" | "destructive";
  "data-action"?: string;
  onClick?: () => void;
}

function QuickActionButton({
  icon,
  label,
  disabled,
  variant = "default",
  onClick,
  ...rest
}: QuickActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-left",
        "hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "destructive" && "text-red-700 hover:bg-red-50",
      )}
      {...rest}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

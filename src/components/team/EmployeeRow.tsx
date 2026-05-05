"use client";

/**
 * EmployeeRow — single row in the new Teams tab list. Click-through
 * wraps the name cell in a <Link> to /staff/[id]. Marketing viewers'
 * rows are NOT wrapped in <Link> because the server-side
 * `canAccessProfile` returns `false` for marketing — clicking through
 * would 403. Both the visual cue (no cursor/hover) and the missing
 * link element enforce this.
 *
 * 2026-05-04: introduced for the Teams tab redesign (spec PR #77).
 */

import Link from "next/link";
import { ROLE_DISPLAY_NAMES } from "@/lib/role-permissions";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { cn } from "@/lib/utils";
import type { EmployeeListItem } from "@/hooks/useEmployeesList";

const STATUS_TONE: Record<EmployeeListItem["status"], string> = {
  active: "bg-emerald-100 text-emerald-800 border-emerald-300",
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  deactivated: "bg-gray-100 text-gray-700 border-gray-300",
};

const STATUS_LABEL: Record<EmployeeListItem["status"], string> = {
  active: "Active",
  pending: "Pending",
  deactivated: "Deactivated",
};

export interface EmployeeRowProps {
  employee: EmployeeListItem;
  viewerRole: string;
  /** The current `?…` search string from the list, passed through so
   *  the profile's Previous/Next nav can re-derive the filter state. */
  listSearchString: string;
}

export function EmployeeRow({
  employee,
  viewerRole,
  listSearchString,
}: EmployeeRowProps) {
  const profileHref = `/staff/${employee.id}${listSearchString}`;
  const roleLabel =
    ROLE_DISPLAY_NAMES[employee.role as keyof typeof ROLE_DISPLAY_NAMES] ??
    employee.role;
  const isClickable = viewerRole !== "marketing";

  // Single Link on the name cell only — semantically valid (no <tr>
  // wrap), single test target (getByRole("link") returns exactly one).
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
        <p className="font-medium text-foreground">{employee.name}</p>
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
    <tr
      className={cn(
        "border-t border-border",
        isClickable && "hover:bg-surface/30 cursor-pointer",
      )}
      data-testid={`employee-row-${employee.id}`}
    >
      <td className="px-4 py-3">{nameCell}</td>
      <td className="px-4 py-3 text-sm text-foreground/80">{roleLabel}</td>
      <td className="px-4 py-3 text-sm text-foreground/80">
        {employee.service?.name ?? "—"}
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-bold uppercase tracking-wide",
            STATUS_TONE[employee.status],
          )}
        >
          {STATUS_LABEL[employee.status]}
        </span>
      </td>
      {/* Actions kebab — wired in PR 4 (quick-action endpoint). */}
      <td className="px-4 py-3 text-right text-muted">⋯</td>
    </tr>
  );
}

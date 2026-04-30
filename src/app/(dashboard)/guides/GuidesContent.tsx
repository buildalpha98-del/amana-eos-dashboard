"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Printer, Link2, Check, ChevronDown } from "lucide-react";
import { staffGuides, guideRoleKeys } from "@/lib/staff-guides";
import { ROLE_DISPLAY_NAMES, ADMIN_ROLES } from "@/lib/role-permissions";
import { QuickStartGuide } from "@/components/guides/QuickStartGuide";
import type { Role } from "@prisma/client";

const ADMIN_ROLE_SET = new Set<string>(ADMIN_ROLES);

export function GuidesContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();

  const userRole = (session?.user as { role?: string } | undefined)?.role ?? "staff";
  const canSwitchRoles = ADMIN_ROLE_SET.has(userRole);

  // Determine active role from URL param (admin only) or session
  const paramRole = searchParams.get("role");
  const activeRole =
    canSwitchRoles && paramRole && staffGuides[paramRole]
      ? paramRole
      : canSwitchRoles && paramRole
        ? userRole
        : userRole;

  const guide = staffGuides[activeRole] ?? staffGuides.staff;

  const [copied, setCopied] = useState(false);

  const handleRoleChange = useCallback(
    (role: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("role", role);
      router.push(`/guides?${params.toString()}`);
    },
    [searchParams, router]
  );

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleShareLink = useCallback(() => {
    const url = `${window.location.origin}/guides?role=${activeRole}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [activeRole]);

  return (
    <div className="p-6 md:p-10">
      {/* Toolbar — hidden when printing */}
      <div className="flex flex-wrap items-center gap-3 mb-6 print:hidden">
        {/* Role selector (admin/owner/head_office only) */}
        {canSwitchRoles && (
          <div className="relative">
            <select
              value={activeRole}
              onChange={(e) => handleRoleChange(e.target.value)}
              className="appearance-none rounded-lg border border-border bg-card px-3 py-2 pr-8 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {guideRoleKeys.map((key) => (
                <option key={key} value={key}>
                  {ROLE_DISPLAY_NAMES[key as Role] ?? key}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>
        )}

        <div className="flex-1" />

        {/* Share Link */}
        <button
          type="button"
          onClick={handleShareLink}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-surface transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-green-500" />
              Copied
            </>
          ) : (
            <>
              <Link2 className="h-4 w-4" />
              Share Link
            </>
          )}
        </button>

        {/* Print */}
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
        >
          <Printer className="h-4 w-4" />
          Print Guide
        </button>
      </div>

      {/* Guide content */}
      <QuickStartGuide guide={guide} />
    </div>
  );
}

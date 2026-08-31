"use client";

import { useState, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Printer, Link2, Check, ChevronDown } from "lucide-react";
import { staffGuides, guideRoleKeys } from "@/lib/staff-guides";
import { ROLE_DISPLAY_NAMES, ADMIN_ROLES } from "@/lib/role-permissions";
import { QuickStartGuide } from "@/components/guides/QuickStartGuide";
import type { Role } from "@prisma/client";
import {
  mergeOrgSettings,
  type OrgSettingsConfig,
} from "@/lib/org-settings-shared";

const ADMIN_ROLE_SET = new Set<string>(ADMIN_ROLES);

export function GuidesContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  // 2026-07-05: guides render both standalone (/guides redirect stub) and
  // inside the /handbook hub's Guides tab — derive links from the current
  // pathname instead of hard-coding /guides so the role switcher and share
  // links stay on the hub (and keep its ?tab= param).
  const pathname = usePathname();

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

  const baseGuide = staffGuides[activeRole] ?? staffGuides.staff;

  // 2026-05-16: overlay the admin-editable welcome message from
  // OrgSettings.config.roleGuides. Fetched client-side; falls through to
  // baseGuide.welcome until the request resolves so there's no flash.
  const [overrideWelcome, setOverrideWelcome] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/org-settings/config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { config?: unknown } | null) => {
        if (cancelled || !body) return;
        const merged: OrgSettingsConfig = mergeOrgSettings(body.config);
        const entry = merged.roleGuides[activeRole as keyof OrgSettingsConfig["roleGuides"]];
        const w = entry?.welcomeMessage?.trim();
        setOverrideWelcome(w && w.length > 0 ? w : null);
      })
      .catch(() => {
        /* keep code default */
      });
    return () => {
      cancelled = true;
    };
  }, [activeRole]);

  const guide = overrideWelcome
    ? { ...baseGuide, welcome: overrideWelcome }
    : baseGuide;

  const [copied, setCopied] = useState(false);

  const handleRoleChange = useCallback(
    (role: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("role", role);
      router.push(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname]
  );

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleShareLink = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("role", activeRole);
    const url = `${window.location.origin}${pathname}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [activeRole, pathname, searchParams]);

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
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
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

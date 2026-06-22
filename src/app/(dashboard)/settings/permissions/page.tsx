"use client";

/**
 * /settings/permissions — role × page access matrix.
 *
 * Owner edits, admin/head_office can view. Owner row is locked at
 * "full access" (the underlying API forces it back to null on save
 * even if a client tries to send a restricted set). Admin row keeps
 * a set of REQUIRED paths checked + disabled — without those the org
 * can't reach this page or org settings to undo a mistake.
 *
 * Changes propagate to active sessions within ~5 min via the JWT
 * tokenVersion refresh in src/lib/auth.ts.
 *
 * 2026-06-02.
 */

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, RotateCcw, ShieldCheck, AlertTriangle } from "lucide-react";
import type { Role } from "@prisma/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchApi, mutateApi, ApiResponseError } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { useRoleLabel } from "@/contexts/RoleLabelsContext";
import { cn } from "@/lib/utils";

interface RolePermissionsResponse {
  /** Saved overrides — null per role = use defaults. */
  overrides: Record<Role, string[] | null>;
  /** Compile-time defaults so we can render Reset-to-defaults. */
  defaults: Record<Role, string[]>;
  /** Every routable page in the dashboard. */
  pages: string[];
}

// Server forces these to be checked for admin no matter what — mirror
// the list here so the UI shows the locked state. Source of truth is
// /api/settings/role-permissions/route.ts ADMIN_REQUIRED_PATHS.
const ADMIN_LOCKED_PATHS = new Set([
  "/settings",
  "/settings/permissions",
  "/settings/organisation",
  "/team",
  "/dashboard",
]);

const ROLES_ORDER: readonly Role[] = [
  "owner",
  "head_office",
  "admin",
  "marketing",
  "member",
  "staff",
  "eos_viewer",
];

/** Group pages by their first URL segment for a readable matrix. */
function groupPages(pages: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const p of pages.slice().sort()) {
    const segment = p.split("/")[1] || "/";
    const key = segment.charAt(0).toUpperCase() + segment.slice(1);
    (groups[key] ??= []).push(p);
  }
  return groups;
}

export default function RolePermissionsPage() {
  const { data: session } = useSession();
  const role = session?.user?.role as Role | undefined;
  const isOwner = role === "owner";

  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<
    RolePermissionsResponse,
    ApiResponseError
  >({
    queryKey: ["role-permissions"],
    queryFn: () => fetchApi("/api/settings/role-permissions"),
    staleTime: 30_000,
  });

  // Local working copy — initialised from server, edited by the user,
  // saved on Save. Map of role → Set<path> for fast contains checks.
  const [working, setWorking] = useState<Record<Role, Set<string>> | null>(
    null,
  );
  const [hydrated, setHydrated] = useState(false);

  // Hydrate working copy from server data on first load.
  useEffect(() => {
    if (!data || hydrated) return;
    const next: Record<Role, Set<string>> = {
      owner: new Set(),
      head_office: new Set(),
      admin: new Set(),
      marketing: new Set(),
      member: new Set(),
      staff: new Set(),
      eos_viewer: new Set(),
    };
    for (const r of ROLES_ORDER) {
      const list = data.overrides[r] ?? data.defaults[r];
      next[r] = new Set(list);
    }
    setWorking(next);
    setHydrated(true);
  }, [data, hydrated]);

  const grouped = useMemo(
    () => (data ? groupPages(data.pages) : {}),
    [data],
  );

  const saveMut = useMutation({
    mutationFn: async (overrides: Record<Role, string[] | null>) =>
      mutateApi("/api/settings/role-permissions", {
        method: "PUT",
        body: { overrides },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-permissions"] });
      toast({
        description:
          "Permissions saved. Active sessions pick up the change within ~5 min.",
      });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  function togglePage(role: Role, path: string) {
    if (!working) return;
    if (role === "owner") return; // owner locked at full access
    if (role === "admin" && ADMIN_LOCKED_PATHS.has(path)) return; // required
    const next = { ...working };
    next[role] = new Set(working[role]);
    if (next[role].has(path)) next[role].delete(path);
    else next[role].add(path);
    setWorking(next);
  }

  function resetRoleToDefault(role: Role) {
    if (!working || !data) return;
    const next = { ...working };
    next[role] = new Set(data.defaults[role]);
    setWorking(next);
  }

  function resetAll() {
    if (!data) return;
    const next: Record<Role, Set<string>> = {
      owner: new Set(),
      head_office: new Set(),
      admin: new Set(),
      marketing: new Set(),
      member: new Set(),
      staff: new Set(),
      eos_viewer: new Set(),
    };
    for (const r of ROLES_ORDER) {
      next[r] = new Set(data.defaults[r]);
    }
    setWorking(next);
  }

  function handleSave() {
    if (!working || !data) return;
    // Convert Sets → arrays + null when the row matches defaults.
    const overrides: Record<Role, string[] | null> = {
      owner: null,
      head_office: null,
      admin: null,
      marketing: null,
      member: null,
      staff: null,
      eos_viewer: null,
    };
    for (const r of ROLES_ORDER) {
      const list = [...working[r]].sort();
      const def = [...data.defaults[r]].sort();
      // If working === default, store null (use defaults). Otherwise
      // store the array. Server applies guardrails on save.
      overrides[r] =
        list.length === def.length && list.every((p, i) => p === def[i])
          ? null
          : list;
    }
    saveMut.mutate(overrides);
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6 animate-pulse space-y-3">
        <div className="h-8 w-64 bg-border rounded" />
        <div className="h-64 bg-border/40 rounded-xl" />
      </div>
    );
  }

  if (error || !data || !working) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <p className="text-sm text-red-600">
          Unable to load permissions. Please refresh.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <PageHeader title="Role permissions">
        <p className="text-sm text-muted">
          Choose which pages each role can visit.{" "}
          {isOwner ? "Edits are owner-only." : "View-only — only the owner can save changes."}
        </p>
      </PageHeader>

      <div className="rounded-md border border-blue-200 bg-blue-50/40 p-4 text-sm text-blue-900 flex items-start gap-2">
        <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">Guardrails</p>
          <ul className="text-xs space-y-0.5 list-disc pl-4">
            <li>Owner row is always full-access — can&apos;t lock yourself out.</li>
            <li>
              Admin must keep <code>/settings</code>, <code>/settings/permissions</code>,
              <code>/settings/organisation</code>, <code>/team</code> and{" "}
              <code>/dashboard</code> — those are forced on save.
            </li>
            <li>
              Active sessions pick up changes within ~5 min; force-logout staff
              if you need it immediate.
            </li>
          </ul>
        </div>
      </div>

      {isOwner && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={resetAll}
            disabled={saveMut.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-muted border border-border rounded-md hover:bg-surface disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Reset all to defaults
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMut.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saveMut.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface/50 border-b border-border sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-foreground text-xs uppercase tracking-wider">
                Page
              </th>
              {ROLES_ORDER.map((r) => (
                <RoleHeader key={r} role={r} onReset={resetRoleToDefault} isOwner={isOwner} />
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([groupName, pages]) => (
              <tbody key={groupName} className="contents">
                <tr className="bg-surface/30">
                  <td
                    colSpan={ROLES_ORDER.length + 1}
                    className="px-3 py-1.5 text-xs font-semibold text-muted uppercase tracking-wider border-t border-border"
                  >
                    {groupName}
                  </td>
                </tr>
                {pages.map((p) => (
                  <tr key={p} className="border-t border-border/40 hover:bg-surface/30">
                    <td className="px-3 py-1.5 text-xs font-mono text-foreground">
                      {p}
                    </td>
                    {ROLES_ORDER.map((r) => {
                      const checked = working[r].has(p);
                      const ownerLocked = r === "owner";
                      const adminLocked =
                        r === "admin" && ADMIN_LOCKED_PATHS.has(p);
                      const disabled = !isOwner || ownerLocked || adminLocked;
                      return (
                        <td
                          key={r}
                          className={cn(
                            "px-3 py-1.5 text-center",
                            (ownerLocked || adminLocked) && "bg-surface/40",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={ownerLocked ? true : adminLocked ? true : checked}
                            disabled={disabled}
                            onChange={() => togglePage(r, p)}
                            className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`${r} can access ${p}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </tbody>
        </table>
      </div>

      {!isOwner && (
        <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>
            You can view this page but only the owner role can save changes.
          </p>
        </div>
      )}
    </div>
  );
}

function RoleHeader({
  role,
  onReset,
  isOwner,
}: {
  role: Role;
  onReset: (r: Role) => void;
  isOwner: boolean;
}) {
  const label = useRoleLabel(role);
  return (
    <th className="px-2 py-2 text-xs uppercase tracking-wider text-foreground">
      <div className="flex flex-col items-center gap-1">
        <span>{label}</span>
        {isOwner && role !== "owner" && (
          <button
            type="button"
            onClick={() => onReset(role)}
            className="text-[10px] font-normal text-muted hover:text-foreground normal-case"
            title="Reset this column to defaults"
          >
            <RotateCcw className="w-3 h-3 inline" /> Reset
          </button>
        )}
      </div>
    </th>
  );
}

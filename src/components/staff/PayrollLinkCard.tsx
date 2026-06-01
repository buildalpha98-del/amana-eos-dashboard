"use client";

/**
 * PayrollLinkCard — per-staff "link to Employment Hero employee" widget.
 *
 * Lives inside the Pay & compensation section on the long-scroll staff
 * profile. Admin-only (the parent gates rendering on `canManagePayroll`).
 *
 * Two visual states:
 *   - Unlinked: text input + "Link" button. Server verifies the typed
 *     ID exists in EH and is Active before saving. Bad IDs surface as
 *     a 404 with a clear message; the form stays editable.
 *   - Linked: shows the current EH employee id and the verified EH
 *     name (returned from the link call). Provides "Unlink" + an
 *     "Edit" affordance that drops back to the input.
 *
 * The "Link" button doubles as the staff's manual sync: it round-trips
 * to EH on every click so an admin can re-verify or re-point at a new
 * EH record. There's no separate "sync" button — link IS sync, kept
 * to one motion.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Link as LinkIcon, Loader2, X } from "lucide-react";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export interface PayrollLinkCardProps {
  targetUserId: string;
  targetUserName: string;
  currentEmployeeId: number | null;
}

export function PayrollLinkCard({
  targetUserId,
  targetUserName,
  currentEmployeeId,
}: PayrollLinkCardProps) {
  const qc = useQueryClient();
  // The optimistic-display state — what the UI shows is determined by
  // (currentEmployeeId merged with `mutationResult` when present), so
  // a successful link immediately reflects without waiting for the
  // server-component refetch.
  const [optimistic, setOptimistic] = useState<{
    employeeId: number | null;
    ehName: string | null;
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const displayEmployeeId = optimistic?.employeeId ?? currentEmployeeId;
  const displayName = optimistic?.ehName ?? null;
  const isLinked = displayEmployeeId !== null && !editing;

  const linkMutation = useMutation<
    { id: string; name: string; employmentHeroEmployeeId: number | null; ehName: string | null },
    Error,
    { employeeId: number | null }
  >({
    mutationFn: ({ employeeId }) =>
      mutateApi("/api/eh-payroll/map", {
        method: "POST",
        body: { userId: targetUserId, employeeId },
      }),
    onSuccess: (data, vars) => {
      setOptimistic({
        employeeId: data.employmentHeroEmployeeId,
        ehName: data.ehName,
      });
      setEditing(false);
      setInputValue("");
      toast({
        description:
          vars.employeeId === null
            ? "Unlinked from Employment Hero."
            : `Linked to ${data.ehName ?? `EH employee ${vars.employeeId}`}.`,
      });
      // Refresh the page's server-side data so subsequent reloads see
      // the new value. The router refresh is light because the page
      // already pulls from Prisma — no extra EH round-trip.
      qc.invalidateQueries();
    },
    onError: (err) => {
      toast({ variant: "destructive", description: err.message });
    },
  });

  const handleLink = () => {
    const n = Number(inputValue.trim());
    if (!Number.isFinite(n) || n <= 0) {
      toast({
        variant: "destructive",
        description: "Enter the numeric EH employee ID.",
      });
      return;
    }
    linkMutation.mutate({ employeeId: n });
  };

  const handleUnlink = () => {
    if (
      !window.confirm(
        `Unlink ${targetUserName} from Employment Hero? They will stop seeing payslips, leave balances, and expenses on My Portal until re-linked.`,
      )
    ) {
      return;
    }
    linkMutation.mutate({ employeeId: null });
  };

  return (
    <div className="rounded-lg border border-border bg-background p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Employment Hero link
          </p>
          <p className="text-sm text-muted mt-1">
            Type {targetUserName}&apos;s EH Payroll employee ID. The dashboard
            verifies it against Employment Hero before saving.
          </p>
        </div>
        {isLinked && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Linked
          </span>
        )}
      </div>

      {isLinked ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div>
            <p className="text-sm font-medium text-foreground">
              EH employee #{displayEmployeeId}
              {displayName && (
                <span className="text-muted font-normal"> · {displayName}</span>
              )}
            </p>
            <p className="text-xs text-muted mt-0.5">
              Manage payslips, leave, and expenses through Employment Hero.
              This dashboard surfaces the data; the source of truth lives there.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setInputValue(String(displayEmployeeId));
              }}
              disabled={linkMutation.isPending}
              className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-surface disabled:opacity-50"
              data-testid="payroll-link-edit"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleUnlink}
              disabled={linkMutation.isPending}
              className="text-xs px-2.5 py-1.5 rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
              data-testid="payroll-link-unlink"
            >
              {linkMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                "Unlink"
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <label
              htmlFor={`eh-id-${targetUserId}`}
              className="block text-xs font-medium text-foreground/80 mb-1"
            >
              EH Payroll employee ID
            </label>
            <input
              id={`eh-id-${targetUserId}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 13136582"
              disabled={linkMutation.isPending}
              className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
              data-testid="payroll-link-input"
              onKeyDown={(e) => {
                if (e.key === "Enter" && inputValue && !linkMutation.isPending) {
                  e.preventDefault();
                  handleLink();
                }
              }}
            />
            <p className="mt-1 text-[11px] text-muted">
              Find this in Employment Hero → Employees → click the staff member →
              the number after <code>?employeeId=</code> in the URL.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setInputValue("");
                }}
                disabled={linkMutation.isPending}
                className="px-2.5 py-1.5 rounded-md border border-border text-sm hover:bg-surface disabled:opacity-50"
                aria-label="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleLink}
              disabled={!inputValue || linkMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-brand rounded-md hover:bg-brand/90 transition-colors disabled:opacity-50"
              data-testid="payroll-link-submit"
            >
              {linkMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LinkIcon className="w-4 h-4" />
              )}
              {linkMutation.isPending ? "Verifying…" : "Link & sync"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

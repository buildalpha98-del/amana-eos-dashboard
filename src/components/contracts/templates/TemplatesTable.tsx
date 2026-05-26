"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Copy, FileText, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  useContractTemplates,
  useCloneContractTemplate,
  useDeleteContractTemplate,
  useUpdateContractTemplate,
  type ContractTemplateData,
} from "@/hooks/useContractTemplates";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  onCreate?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateAU(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const inputCls =
  "px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent";

// ── Status badge ──────────────────────────────────────────────────────────────

function TemplateBadge({ status }: { status: "active" | "disabled" }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface text-muted border border-border">
      Disabled
    </span>
  );
}

// ── Row actions dropdown ──────────────────────────────────────────────────────

/**
 * Width of the dropdown panel (Tailwind `w-44` = 11rem = 176px) — kept in
 * sync with the className below. Used by the positioning logic so we
 * don't have to wait a frame to measure the menu before placing it.
 */
const MENU_W = 176;
/** Approximate menu height (4 items + separator + padding) for first-paint placement. */
const MENU_H_DEFAULT = 188;
const VIEWPORT_GAP = 8;
const TRIGGER_GAP = 4;

function RowActions({
  template,
  onNavigate,
}: {
  template: ContractTemplateData;
  onNavigate: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const clone = useCloneContractTemplate();
  const del = useDeleteContractTemplate();
  const update = useUpdateContractTemplate();

  // Position the dropdown in viewport coordinates. Portaling to <body>
  // sidesteps the table's `overflow-hidden` (which is what was clipping
  // the menu on rows near the bottom of the list). The flip-up logic
  // covers rows that don't have room below.
  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    function place() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      // jsdom (and a layoutless first paint) returns offsetWidth/Height
      // of 0 — fall back to our known constants in that case, otherwise
      // the flip-above check would always think the menu is zero-size.
      const measuredH = menuRef.current?.offsetHeight ?? 0;
      const measuredW = menuRef.current?.offsetWidth ?? 0;
      const menuH = measuredH > 0 ? measuredH : MENU_H_DEFAULT;
      const menuW = measuredW > 0 ? measuredW : MENU_W;

      // Below the trigger by default; flip above if it would overflow
      // the viewport's bottom edge.
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipAbove = spaceBelow < menuH + TRIGGER_GAP + VIEWPORT_GAP;
      const top = flipAbove
        ? Math.max(VIEWPORT_GAP, rect.top - menuH - TRIGGER_GAP)
        : rect.bottom + TRIGGER_GAP;

      // Right-align with the trigger, but clamp inside the viewport so a
      // menu near the right edge doesn't get pushed off-screen.
      const desiredLeft = rect.right - menuW;
      const left = Math.min(
        Math.max(VIEWPORT_GAP, desiredLeft),
        window.innerWidth - menuW - VIEWPORT_GAP,
      );

      setCoords({ top, left });
    }
    place();
    // Re-place while the menu is open in case the user scrolls the
    // table or resizes the window.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // Close on Escape so keyboard users have a way out without clicking
  // the backdrop.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function handleClone() {
    setOpen(false);
    clone.mutate(template.id, {
      onSuccess: () => {
        // toast from hook; nothing extra here
      },
    });
  }

  function handleToggleStatus() {
    setOpen(false);
    const newStatus = template.status === "active" ? "disabled" : "active";
    update.mutate(
      { id: template.id, status: newStatus },
      {
        onSuccess: () => {
          // toast from hook
        },
      }
    );
  }

  function handleDelete() {
    setOpen(false);
    if (!confirm(`Delete "${template.name}"? This cannot be undone.`)) return;
    del.mutate(template.id);
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-lg hover:bg-surface transition-colors"
        aria-label="Template actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="w-4 h-4 text-muted" />
      </button>

      {open && typeof document !== "undefined" &&
        createPortal(
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
              data-testid="row-actions-backdrop"
            />
            {/* Dropdown — fixed-positioned via measured coords so it can
                escape the table's overflow-hidden container. */}
            <div
              ref={menuRef}
              role="menu"
              data-testid="row-actions-menu"
              style={{
                position: "fixed",
                top: coords?.top ?? -9999,
                left: coords?.left ?? -9999,
                // Hide for the first frame until useLayoutEffect has
                // measured & placed us — otherwise the menu flashes at
                // 0,0 briefly.
                visibility: coords ? "visible" : "hidden",
              }}
              className="z-50 bg-card border border-border rounded-xl shadow-lg py-1 w-44"
            >
              <button
                role="menuitem"
                onClick={() => { setOpen(false); onNavigate(template.id); }}
                className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-surface transition-colors"
              >
                Edit
              </button>
              <button
                role="menuitem"
                onClick={handleClone}
                disabled={clone.isPending}
                className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-surface transition-colors flex items-center gap-2"
              >
                <Copy className="w-3.5 h-3.5" />
                Clone
              </button>
              <button
                role="menuitem"
                onClick={handleToggleStatus}
                disabled={update.isPending}
                className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-surface transition-colors"
              >
                {template.status === "active" ? "Disable" : "Enable"}
              </button>
              <div className="border-t border-border/50 my-1" />
              <button
                role="menuitem"
                onClick={handleDelete}
                disabled={del.isPending}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TemplatesTable({ onCreate }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const {
    data: templates = [],
    isLoading,
    error,
    refetch,
  } = useContractTemplates({
    status: statusFilter || undefined,
    search: search || undefined,
  });

  const hasFilters = !!(search || statusFilter);

  function handleNavigate(id: string) {
    router.push(`/contracts/templates/${id}`);
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-3 mt-6">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <ErrorState
        title="Failed to load templates"
        error={error as Error}
        onRetry={refetch}
      />
    );
  }

  return (
    <>
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 my-6">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className={cn(inputCls, "pl-9 w-full")}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={inputCls}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        {hasFilters && (
          <button
            onClick={() => { setSearch(""); setStatusFilter(""); }}
            className="text-xs text-brand hover:underline font-medium"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Empty state */}
      {templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={hasFilters ? "No templates match your filters" : "No templates yet"}
          description={
            hasFilters
              ? "Try adjusting your search or status filter."
              : "Create your first contract template to start issuing contracts from a consistent base."
          }
          action={
            !hasFilters && onCreate
              ? { label: "Create First Template", icon: Plus, onClick: onCreate }
              : undefined
          }
        />
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid sm:grid-cols-[1fr_140px_150px_100px_56px] gap-3 px-5 py-3 bg-surface/50 border-b border-border text-xs font-semibold text-muted uppercase tracking-wider">
            <span>Name</span>
            <span>Last Edited</span>
            <span>Updated By</span>
            <span>Status</span>
            <span />
          </div>

          {/* Rows */}
          <div className="divide-y divide-border/50">
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex sm:grid sm:grid-cols-[1fr_140px_150px_100px_56px] gap-3 items-center px-5 py-3.5 hover:bg-surface/60 transition-colors"
              >
                {/* Name */}
                <div className="min-w-0">
                  <button
                    onClick={() => handleNavigate(template.id)}
                    className="text-sm font-medium text-foreground hover:text-brand transition-colors text-left truncate block max-w-full"
                  >
                    {template.name}
                  </button>
                  {template.description && (
                    <p className="text-xs text-muted truncate mt-0.5">
                      {template.description}
                    </p>
                  )}
                </div>

                {/* Last edited */}
                <span className="hidden sm:block text-sm text-muted">
                  {formatDateAU(template.updatedAt)}
                </span>

                {/* Updated by */}
                <span className="hidden sm:block text-sm text-muted truncate">
                  {template.updatedBy?.name ?? template.createdBy?.name ?? "—"}
                </span>

                {/* Status */}
                <div className="hidden sm:block">
                  <TemplateBadge status={template.status} />
                </div>

                {/* Actions */}
                <div className="ml-auto sm:ml-0">
                  <RowActions template={template} onNavigate={handleNavigate} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

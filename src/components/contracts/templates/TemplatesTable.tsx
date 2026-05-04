"use client";

import { useState } from "react";
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

function RowActions({
  template,
  onNavigate,
}: {
  template: ContractTemplateData;
  onNavigate: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const clone = useCloneContractTemplate();
  const del = useDeleteContractTemplate();
  const update = useUpdateContractTemplate();

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
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-lg hover:bg-surface transition-colors"
        aria-label="Template actions"
      >
        <MoreHorizontal className="w-4 h-4 text-muted" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          {/* Dropdown */}
          <div className="absolute right-0 top-8 z-20 bg-card border border-border rounded-xl shadow-lg py-1 w-44">
            <button
              onClick={() => { setOpen(false); onNavigate(template.id); }}
              className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-surface transition-colors"
            >
              Edit
            </button>
            <button
              onClick={handleClone}
              disabled={clone.isPending}
              className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-surface transition-colors flex items-center gap-2"
            >
              <Copy className="w-3.5 h-3.5" />
              Clone
            </button>
            <button
              onClick={handleToggleStatus}
              disabled={update.isPending}
              className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-surface transition-colors"
            >
              {template.status === "active" ? "Disable" : "Enable"}
            </button>
            <div className="border-t border-border/50 my-1" />
            <button
              onClick={handleDelete}
              disabled={del.isPending}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </>
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

"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  Loader2,
  ClipboardList,
  AlertCircle,
  CheckCheck,
  Printer,
} from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: string;
  category: string;
  label: string;
  sortOrder: number;
  isRequired: boolean;
  checked: boolean;
  checkedAt: string | null;
  checkedById: string | null;
  notes: string | null;
}

interface Checklist {
  id: string;
  date: string;
  sessionType: string;
  status: string;
  completedAt: string | null;
  completedBy: { id: string; name: string } | null;
  notes: string | null;
  items: ChecklistItem[];
}

function sessionLabel(type: string) {
  switch (type) {
    case "bsc":
      return "Before School";
    case "asc":
      return "After School";
    case "vc":
      return "Vacation Care";
    default:
      return type.toUpperCase();
  }
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    in_progress: "bg-blue-100 text-blue-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        styles[status] || "bg-gray-100 text-gray-500"
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ChecklistCard({
  checklist,
  serviceId,
}: {
  checklist: Checklist;
  serviceId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const toggleItem = useMutation({
    mutationFn: async ({
      itemId,
      checked,
    }: {
      itemId: string;
      checked: boolean;
    }) => {
      const res = await fetch(
        `/api/services/${serviceId}/checklists/${checklist.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, checked }),
        }
      );
      if (!res.ok) throw new Error("Failed to update checklist item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["service-checklists", serviceId],
      });
    },
  });

  const markAllComplete = useMutation({
    mutationFn: async () => {
      const unchecked = checklist.items.filter((i) => !i.checked);
      for (const item of unchecked) {
        const res = await fetch(
          `/api/services/${serviceId}/checklists/${checklist.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: item.id, checked: true }),
          }
        );
        if (!res.ok) throw new Error("Failed to update checklist item");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["service-checklists", serviceId],
      });
    },
  });

  const checkedCount = checklist.items.filter((i) => i.checked).length;
  const totalCount = checklist.items.length;
  const progress =
    totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  // Group items by category
  const grouped: Record<string, ChecklistItem[]> = {};
  for (const item of checklist.items) {
    const cat = item.category || "General";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  const date = new Date(checklist.date);
  const dateStr = date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-surface/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted" />
          )}
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {dateStr}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-brand/10 text-brand">
                {sessionLabel(checklist.sessionType)}
              </span>
              {statusBadge(checklist.status)}
            </div>
            {checklist.completedBy && (
              <p className="text-xs text-muted mt-0.5">
                Completed by {checklist.completedBy.name}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {checkedCount < totalCount && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                markAllComplete.mutate();
              }}
              disabled={markAllComplete.isPending}
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors disabled:opacity-50"
            >
              {markAllComplete.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <CheckCheck className="w-3 h-3" />
              )}
              Mark All
            </button>
          )}
          <div className="text-right">
            <div className="text-xs text-muted">
              {checkedCount}/{totalCount}
            </div>
            <div className="w-24 h-1.5 bg-border rounded-full mt-1">
              <div
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  progress === 100 ? "bg-emerald-500" : "bg-brand"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </button>

      {/* Expanded items */}
      {expanded && (
        <div className="border-t border-border/50 px-4 py-3 space-y-4">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                {category}
              </h4>
              <div className="space-y-1.5">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() =>
                      toggleItem.mutate({
                        itemId: item.id,
                        checked: !item.checked,
                      })
                    }
                    disabled={toggleItem.isPending}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface/50 transition-colors text-left group"
                  >
                    {item.checked ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted/50 group-hover:text-brand flex-shrink-0" />
                    )}
                    <span
                      className={cn(
                        "text-sm flex-1",
                        item.checked
                          ? "text-muted line-through"
                          : "text-foreground/80"
                      )}
                    >
                      {item.label}
                    </span>
                    {item.isRequired && !item.checked && (
                      <span className="text-[10px] text-amber-600 font-medium">
                        Required
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {checklist.notes && (
            <div className="bg-surface/50 rounded-lg p-3 mt-2">
              <p className="text-xs text-muted font-medium mb-1">Notes</p>
              <p className="text-sm text-foreground/80">{checklist.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Build print-optimized HTML and trigger window.print() */
function printChecklists(checklists: Checklist[], serviceName: string) {
  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Build grouped items for each checklist
  const sections = checklists.map((cl) => {
    const grouped: Record<string, ChecklistItem[]> = {};
    for (const item of cl.items) {
      const cat = item.category || "General";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    }
    const date = new Date(cl.date).toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return { checklist: cl, grouped, dateStr: date };
  });

  // Create a hidden print container
  const printContainer = document.createElement("div");
  printContainer.id = "print-checklists-container";
  printContainer.className = "print-only";

  // Print header
  printContainer.innerHTML = `
    <div class="print-header">
      <div class="print-header-brand">Amana OSHC</div>
      <div class="print-header-subtitle">${serviceName} &mdash; Daily Checklists</div>
      <div class="print-header-date">Printed ${today}</div>
    </div>
  `;

  // Render each checklist
  sections.forEach((section, sectionIdx) => {
    const sectionEl = document.createElement("div");
    sectionEl.className = `print-checklist-section${sectionIdx > 0 ? " print-page-break" : ""}`;

    let html = `<div class="print-checklist-title">${section.dateStr} &mdash; ${sessionLabel(section.checklist.sessionType)}</div>`;

    let itemNumber = 1;
    for (const [category, items] of Object.entries(section.grouped)) {
      html += `<div class="print-checklist-category">${category}</div>`;
      for (const item of items) {
        html += `
          <div class="print-checklist-item">
            <span class="print-item-number">${itemNumber}.</span>
            <span class="print-checkbox"></span>
            <span class="print-item-label">${item.label}</span>
            ${item.isRequired ? '<span class="print-item-required">Required</span>' : ""}
          </div>
        `;
        itemNumber++;
      }
    }

    if (section.checklist.notes) {
      html += `<div style="margin-top: 8pt; font-size: 10pt; color: #555;"><strong>Notes:</strong> ${section.checklist.notes}</div>`;
    }

    sectionEl.innerHTML = html;
    printContainer.appendChild(sectionEl);
  });

  // Footer
  const footer = document.createElement("div");
  footer.className = "print-footer print-only";
  footer.textContent = `Amana OSHC - ${serviceName} - Printed ${today}`;
  printContainer.appendChild(footer);

  // Append, print, remove
  document.body.appendChild(printContainer);
  window.print();
  // Clean up after print dialog closes
  setTimeout(() => {
    document.body.removeChild(printContainer);
  }, 1000);
}

export function ServiceChecklistsTab({
  serviceId,
  serviceName,
}: {
  serviceId: string;
  serviceName?: string;
}) {
  const [sessionFilter, setSessionFilter] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["service-checklists", serviceId, sessionFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sessionFilter) params.set("sessionType", sessionFilter);
      params.set("limit", "20");
      const res = await fetch(
        `/api/services/${serviceId}/checklists?${params}`
      );
      if (!res.ok) throw new Error("Failed to load checklists");
      return res.json() as Promise<{ checklists: Checklist[] }>;
    },
  });

  const checklists = data?.checklists || [];

  const handlePrint = useCallback(() => {
    if (checklists.length === 0) return;
    printChecklists(checklists, serviceName || "Centre");
  }, [checklists, serviceName]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-4 space-y-2">
            <div className="flex items-center gap-3">
              <Skeleton className="w-5 h-5 rounded" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-12 ml-auto" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
        <p className="text-sm text-muted">Failed to load checklists</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-brand" />
          Daily Checklists
        </h2>
        <div className="flex items-center gap-2">
          {checklists.length > 0 && (
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-surface/50 text-muted transition-colors"
              title="Print checklists"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>
          )}
          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="px-3 py-1.5 border border-border rounded-lg text-sm text-foreground/80 bg-card"
          >
            <option value="">All Sessions</option>
            <option value="bsc">Before School</option>
            <option value="asc">After School</option>
            <option value="vc">Vacation Care</option>
          </select>
        </div>
      </div>

      {checklists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center mb-4">
            <ClipboardList className="w-6 h-6 text-muted" />
          </div>
          <h3 className="text-sm font-medium text-foreground mb-1">
            No checklists yet
          </h3>
          <p className="text-xs text-muted max-w-xs">
            Daily checklists will appear here once automation generates them for
            this centre.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {checklists.map((checklist) => (
            <ChecklistCard
              key={checklist.id}
              checklist={checklist}
              serviceId={serviceId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

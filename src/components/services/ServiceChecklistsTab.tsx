"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Circle,
  Clock,
  ChevronDown,
  ChevronRight,
  Loader2,
  ClipboardList,
  AlertCircle,
  CheckCheck,
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
        styles[status] || "bg-gray-100 text-gray-600"
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
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                {dateStr}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-brand/10 text-brand">
                {sessionLabel(checklist.sessionType)}
              </span>
              {statusBadge(checklist.status)}
            </div>
            {checklist.completedBy && (
              <p className="text-xs text-gray-500 mt-0.5">
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
            <div className="text-xs text-gray-500">
              {checkedCount}/{totalCount}
            </div>
            <div className="w-24 h-1.5 bg-gray-200 rounded-full mt-1">
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
        <div className="border-t border-gray-100 px-4 py-3 space-y-4">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
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
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left group"
                  >
                    {item.checked ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-300 group-hover:text-brand flex-shrink-0" />
                    )}
                    <span
                      className={cn(
                        "text-sm flex-1",
                        item.checked
                          ? "text-gray-400 line-through"
                          : "text-gray-700"
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
            <div className="bg-gray-50 rounded-lg p-3 mt-2">
              <p className="text-xs text-gray-500 font-medium mb-1">Notes</p>
              <p className="text-sm text-gray-700">{checklist.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ServiceChecklistsTab({ serviceId }: { serviceId: string }) {
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

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
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
        <p className="text-sm text-gray-600">Failed to load checklists</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-brand" />
          Daily Checklists
        </h2>
        <div className="flex items-center gap-2">
          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white"
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
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <ClipboardList className="w-6 h-6 text-gray-400" />
          </div>
          <h3 className="text-sm font-medium text-gray-900 mb-1">
            No checklists yet
          </h3>
          <p className="text-xs text-gray-500 max-w-xs">
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

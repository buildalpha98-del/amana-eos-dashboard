"use client";

import { useState, useEffect, useMemo } from "react";
import {
  FileText,
  CheckSquare,
  MessageCircle,
  Mail,
  Check,
  X,
  Eye,
  Send,
  ChevronDown,
  ChevronRight,
  Building2,
} from "lucide-react";

interface DraftItem {
  id: string;
  itemType: "post" | "task" | "touchpoint" | "school_comm";
  title: string;
  serviceId: string | null;
  serviceName: string | null;
  dueDate: string | null;
  priority: string | null;
  sourceModel: string;
  channel?: string;
  platform?: string;
}

type FilterTab = "all" | "post" | "task" | "touchpoint" | "school_comm";

const ICON_MAP = {
  post: FileText,
  task: CheckSquare,
  touchpoint: MessageCircle,
  school_comm: Mail,
};

const TYPE_LABELS = {
  post: "Post",
  task: "Task",
  touchpoint: "Message",
  school_comm: "School Comm",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  urgent: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-surface text-muted",
};

interface CentreGroup {
  serviceId: string | null;
  serviceName: string;
  items: DraftItem[];
  overdueCount: number;
}

export function DraftsQueue({
  serviceId,
  onSelectTask,
}: {
  serviceId?: string;
  onSelectTask?: (id: string) => void;
}) {
  const [items, setItems] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const fetchItems = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (serviceId) params.set("serviceId", serviceId);
    fetch(`/api/marketing/drafts-queue?${params}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchItems();
  }, [serviceId]);

  const handleAction = async (item: DraftItem, action: string) => {
    try {
      switch (item.itemType) {
        case "post": {
          const status = action === "approve" ? "approved" : "draft";
          await fetch(`/api/marketing/posts/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          });
          break;
        }
        case "task": {
          if (action === "complete") {
            await fetch(`/api/marketing/tasks/${item.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "done" }),
            });
          }
          break;
        }
        case "touchpoint": {
          const tpStatus = action === "approve" ? "approved" : "draft";
          await fetch(`/api/enquiries/touchpoints/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: tpStatus }),
          });
          break;
        }
        case "school_comm": {
          if (action === "approve") {
            await fetch(`/api/school-comms/${item.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "sent" }),
            });
          }
          break;
        }
      }
      fetchItems();
    } catch (err) {
      console.error("Action failed:", err);
    }
  };

  const filtered = filter === "all" ? items : items.filter((i) => i.itemType === filter);

  const tabCounts = {
    all: items.length,
    post: items.filter((i) => i.itemType === "post").length,
    task: items.filter((i) => i.itemType === "task").length,
    touchpoint: items.filter((i) => i.itemType === "touchpoint").length,
    school_comm: items.filter((i) => i.itemType === "school_comm").length,
  };

  // Group filtered items by centre
  const groups: CentreGroup[] = useMemo(() => {
    const map = new Map<string, CentreGroup>();
    const now = new Date();

    for (const item of filtered) {
      const key = item.serviceId || "__unassigned__";
      if (!map.has(key)) {
        map.set(key, {
          serviceId: item.serviceId,
          serviceName: item.serviceName || "Unassigned",
          items: [],
          overdueCount: 0,
        });
      }
      const group = map.get(key)!;
      group.items.push(item);
      if (item.dueDate && new Date(item.dueDate) < now) {
        group.overdueCount++;
      }
    }

    // Sort: groups with overdue items first, then alphabetically
    return Array.from(map.values()).sort((a, b) => {
      if (a.overdueCount > 0 && b.overdueCount === 0) return -1;
      if (b.overdueCount > 0 && a.overdueCount === 0) return 1;
      return a.serviceName.localeCompare(b.serviceName);
    });
  }, [filtered]);

  const hasMultipleCentres = groups.length > 1;

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Counter */}
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-semibold text-foreground">Drafts Queue</h3>
        <span className="bg-red-100 text-red-700 text-xs font-medium px-2.5 py-0.5 rounded-full">
          {items.length} pending
        </span>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 border-b">
        {(["all", "post", "task", "touchpoint", "school_comm"] as FilterTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px ${
              filter === tab
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab === "all" ? "All" : TYPE_LABELS[tab]}
            {tabCounts[tab] > 0 && (
              <span className="ml-1.5 bg-surface text-muted px-1.5 py-0.5 rounded-full text-[10px]">
                {tabCounts[tab]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Items — grouped by centre when multiple centres present */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-muted text-sm">
          No pending items
        </div>
      ) : hasMultipleCentres ? (
        <div className="space-y-3">
          {groups.map((group) => {
            const key = group.serviceId || "__unassigned__";
            const isCollapsed = collapsedGroups.has(key);
            return (
              <div key={key} className="rounded-lg border border-border overflow-hidden">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(key)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 bg-surface/50 hover:bg-surface transition-colors text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted" />
                  )}
                  <Building2 className="h-3.5 w-3.5 text-muted" />
                  <span className="text-sm font-medium text-foreground/80 flex-1 truncate">
                    {group.serviceName}
                  </span>
                  <span className="text-xs text-muted bg-card border border-border px-2 py-0.5 rounded-full">
                    {group.items.length}
                  </span>
                  {group.overdueCount > 0 && (
                    <span className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                      {group.overdueCount} overdue
                    </span>
                  )}
                </button>
                {/* Group items */}
                {!isCollapsed && (
                  <div className="divide-y divide-border/50">
                    {group.items.map((item) => (
                      <DraftItemCard
                        key={`${item.itemType}-${item.id}`}
                        item={item}
                        onAction={handleAction}
                        onView={
                          item.itemType === "task" && onSelectTask
                            ? () => onSelectTask(item.id)
                            : undefined
                        }
                        hideCentre
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <DraftItemCard
              key={`${item.itemType}-${item.id}`}
              item={item}
              onAction={handleAction}
              onView={
                item.itemType === "task" && onSelectTask
                  ? () => onSelectTask(item.id)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DraftItemCard({
  item,
  onAction,
  onView,
  hideCentre,
}: {
  item: DraftItem;
  onAction: (item: DraftItem, action: string) => void;
  onView?: () => void;
  hideCentre?: boolean;
}) {
  const Icon = ICON_MAP[item.itemType];
  const now = new Date();
  const dueDate = item.dueDate ? new Date(item.dueDate) : null;
  const isOverdue = dueDate && dueDate < now;
  const isDueToday = dueDate && dueDate.toDateString() === now.toDateString();

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border ${
        isOverdue
          ? "border-red-200 bg-red-50"
          : isDueToday
          ? "border-amber-200 bg-amber-50"
          : "border-border bg-card"
      }`}
    >
      {/* Icon */}
      <div className="flex-shrink-0">
        <Icon className={`h-4 w-4 ${isOverdue ? "text-red-500" : "text-muted"}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {!hideCentre && item.serviceName && (
            <span className="text-[10px] text-muted">{item.serviceName}</span>
          )}
          {dueDate && (
            <span className={`text-[10px] ${isOverdue ? "text-red-600 font-medium" : "text-muted"}`}>
              {isOverdue ? "Overdue" : isDueToday ? "Due today" : dueDate.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            </span>
          )}
          {item.priority && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${PRIORITY_COLORS[item.priority] || "bg-surface text-muted"}`}>
              {item.priority}
            </span>
          )}
          {item.platform && (
            <span className="text-[10px] text-muted capitalize">{item.platform}</span>
          )}
          {item.channel && (
            <span className="text-[10px] text-muted capitalize">{item.channel}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {onView && (
          <button
            onClick={onView}
            className="p-1.5 rounded hover:bg-surface"
            title="View"
          >
            <Eye className="h-3.5 w-3.5 text-muted" />
          </button>
        )}
        {(item.itemType === "post" || item.itemType === "touchpoint" || item.itemType === "school_comm") && (
          <button
            onClick={() => onAction(item, "approve")}
            className="p-1.5 rounded hover:bg-green-100"
            title={item.itemType === "touchpoint" ? "Approve & Send" : "Approve"}
          >
            {item.itemType === "touchpoint" ? (
              <Send className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Check className="h-3.5 w-3.5 text-green-600" />
            )}
          </button>
        )}
        {item.itemType === "task" && (
          <button
            onClick={() => onAction(item, "complete")}
            className="p-1.5 rounded hover:bg-green-100"
            title="Complete"
          >
            <Check className="h-3.5 w-3.5 text-green-600" />
          </button>
        )}
        {(item.itemType === "post" || item.itemType === "touchpoint") && (
          <button
            onClick={() => onAction(item, "reject")}
            className="p-1.5 rounded hover:bg-red-100"
            title="Reject"
          >
            <X className="h-3.5 w-3.5 text-red-500" />
          </button>
        )}
      </div>
    </div>
  );
}

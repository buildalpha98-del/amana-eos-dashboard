"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  CheckSquare,
  MessageCircle,
  Mail,
  Check,
  X,
  Eye,
  Send,
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
  low: "bg-gray-100 text-gray-600",
};

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

  const fetchItems = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (serviceId) params.set("serviceId", serviceId);
    fetch(`/api/marketing/drafts-queue?${params}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(console.error)
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
        <h3 className="text-lg font-semibold text-gray-900">Drafts Queue</h3>
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
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "all" ? "All" : TYPE_LABELS[tab]}
            {tabCounts[tab] > 0 && (
              <span className="ml-1.5 bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full text-[10px]">
                {tabCounts[tab]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Items */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          No pending items
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
}: {
  item: DraftItem;
  onAction: (item: DraftItem, action: string) => void;
  onView?: () => void;
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
          : "border-gray-200 bg-white"
      }`}
    >
      {/* Icon */}
      <div className="flex-shrink-0">
        <Icon className={`h-4 w-4 ${isOverdue ? "text-red-500" : "text-gray-400"}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {item.serviceName && (
            <span className="text-[10px] text-gray-500">{item.serviceName}</span>
          )}
          {dueDate && (
            <span className={`text-[10px] ${isOverdue ? "text-red-600 font-medium" : "text-gray-400"}`}>
              {isOverdue ? "Overdue" : isDueToday ? "Due today" : dueDate.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
            </span>
          )}
          {item.priority && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${PRIORITY_COLORS[item.priority] || "bg-gray-100 text-gray-600"}`}>
              {item.priority}
            </span>
          )}
          {item.platform && (
            <span className="text-[10px] text-gray-400 capitalize">{item.platform}</span>
          )}
          {item.channel && (
            <span className="text-[10px] text-gray-400 capitalize">{item.channel}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {onView && (
          <button
            onClick={onView}
            className="p-1.5 rounded hover:bg-gray-100"
            title="View"
          >
            <Eye className="h-3.5 w-3.5 text-gray-400" />
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

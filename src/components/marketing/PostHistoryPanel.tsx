"use client";

import { useState, useEffect } from "react";
import { X, History, ArrowRight } from "lucide-react";

interface Revision {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: { id: string; name: string };
}

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  content: "Content",
  status: "Status",
  platform: "Platform",
  scheduledDate: "Scheduled Date",
  pillar: "Pillar",
  notes: "Notes",
  designLink: "Design Link",
  assigneeId: "Assignee",
  campaignId: "Campaign",
};

function formatValue(field: string, value: string | null): string {
  if (!value) return "—";
  if (field === "status") return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  if (field === "scheduledDate") {
    try {
      return new Date(value).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return value;
    }
  }
  if (field === "content" && value.length > 80) return value.slice(0, 80) + "...";
  return value;
}

export function PostHistoryPanel({
  postId,
  onClose,
}: {
  postId: string;
  onClose: () => void;
}) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/marketing/posts/${postId}/revisions`)
      .then((r) => r.json())
      .then((data) => setRevisions(Array.isArray(data) ? data : []))
      .catch(() => setRevisions([]))
      .finally(() => setLoading(false));
  }, [postId]);

  // Group revisions by timestamp (same second = same edit batch)
  const grouped: { time: string; user: string; changes: Revision[] }[] = [];
  for (const rev of revisions) {
    const timeKey = rev.createdAt.slice(0, 19); // group by second
    const last = grouped[grouped.length - 1];
    if (last && last.time === timeKey && last.user === rev.user.name) {
      last.changes.push(rev);
    } else {
      grouped.push({ time: timeKey, user: rev.user.name, changes: [rev] });
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-brand" />
            <span className="text-sm font-semibold text-gray-900">
              Revision History
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand" />
            </div>
          ) : grouped.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">
              No changes recorded yet
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-2 top-2 bottom-2 w-px bg-gray-200" />

              <div className="space-y-4">
                {grouped.map((group, gi) => (
                  <div key={gi} className="relative pl-7">
                    {/* Dot */}
                    <div className="absolute left-0.5 top-1 h-3 w-3 rounded-full border-2 border-brand bg-white" />

                    {/* Meta */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-medium text-gray-700">
                        {group.user}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(group.time).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    {/* Changes */}
                    <div className="space-y-1">
                      {group.changes.map((rev) => (
                        <div
                          key={rev.id}
                          className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                        >
                          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                            {FIELD_LABELS[rev.field] || rev.field}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5 text-xs">
                            <span className="text-gray-400 truncate max-w-[140px]">
                              {formatValue(rev.field, rev.oldValue)}
                            </span>
                            <ArrowRight className="h-3 w-3 text-gray-300 shrink-0" />
                            <span className="text-gray-800 font-medium truncate max-w-[140px]">
                              {formatValue(rev.field, rev.newValue)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

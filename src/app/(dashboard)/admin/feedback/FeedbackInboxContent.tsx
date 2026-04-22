"use client";

import { useState } from "react";
import { Bug, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StickyTable } from "@/components/ui/StickyTable";
import { useFeedbackList, type InternalFeedback } from "@/hooks/useInternalFeedback";
import { FeedbackDetailPanel } from "./FeedbackDetailPanel";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  { value: "bug", label: "Bug" },
  { value: "feature_request", label: "Feature request" },
  { value: "question", label: "Question" },
  { value: "general", label: "General" },
];

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  acknowledged: "bg-indigo-100 text-indigo-700",
  in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-emerald-100 text-emerald-700",
};

const CATEGORY_COLORS: Record<string, string> = {
  bug: "bg-rose-100 text-rose-700",
  feature_request: "bg-violet-100 text-violet-700",
  question: "bg-sky-100 text-sky-700",
  general: "bg-gray-100 text-gray-700",
};

function formatDate(d: string) {
  return new Date(d).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function preview(msg: string, n = 80) {
  return msg.length > n ? msg.slice(0, n - 1) + "…" : msg;
}

export function FeedbackInboxContent() {
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, error } = useFeedbackList({ status, category, page });

  const handleFilterChange = (key: "status" | "category", v: string) => {
    if (key === "status") setStatus(v);
    else setCategory(v);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Report Issue Inbox"
        description="Triage staff-submitted feedback, bugs, and feature requests"
        secondaryActions={[
          { label: "Filters", icon: Filter, onClick: () => setShowFilters((v) => !v) },
        ]}
      />

      {showFilters && (
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => handleFilterChange("status", e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => handleFilterChange("category", e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          Failed to load feedback inbox. You may not have permission to view this page.
        </div>
      )}

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <StickyTable>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/50">
                <th className="px-4 py-3 text-left font-medium text-muted whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-left font-medium text-muted whitespace-nowrap">Author</th>
                <th className="px-4 py-3 text-left font-medium text-muted whitespace-nowrap">Category</th>
                <th className="px-4 py-3 text-left font-medium text-muted whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted whitespace-nowrap">Page</th>
                <th className="px-4 py-3 text-left font-medium text-muted">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                  ))}
                </tr>
              ))}

              {!isLoading && data?.feedback.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-4">
                    <EmptyState
                      icon={Bug}
                      title="No feedback yet"
                      description="When staff submit feedback via the widget, it'll land here."
                      variant="inline"
                    />
                  </td>
                </tr>
              )}

              {!isLoading && data?.feedback.map((f: InternalFeedback) => (
                <tr
                  key={f.id}
                  onClick={() => setSelectedId(f.id)}
                  className="cursor-pointer hover:bg-surface/50 transition-colors"
                >
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(f.createdAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-foreground">{f.author.name ?? f.author.email}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[f.category] ?? ""}`}>
                      {f.category.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[f.status] ?? ""}`}>
                      {f.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-muted">{f.page ?? "-"}</td>
                  <td className="px-4 py-3 text-muted">{preview(f.message)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </StickyTable>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 bg-surface/30">
            <p className="text-sm text-muted">
              Page <span className="font-medium">{data.page}</span> of <span className="font-medium">{data.totalPages}</span> · {data.total} total
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-50"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedId && (
        <FeedbackDetailPanel
          key={selectedId}
          feedbackId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

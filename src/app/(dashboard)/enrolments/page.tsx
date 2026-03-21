"use client";

import { useState } from "react";
import {
  ClipboardList,
  Download,
  Search,
  Baby,
  User,
  Calendar,
} from "lucide-react";
import { useEnrolments, type EnrolmentSubmission } from "@/hooks/useEnrolments";
import { EnrolmentDetailPanel } from "@/components/enrolments/EnrolmentDetailPanel";
import { Skeleton } from "@/components/ui/Skeleton";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "submitted", label: "Submitted" },
  { key: "reviewing", label: "Reviewing" },
  { key: "processed", label: "Confirmed" },
  { key: "needs_info", label: "Needs Info" },
];

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  submitted: { label: "Submitted", color: "bg-blue-50 text-blue-700" },
  reviewing: { label: "Reviewing", color: "bg-amber-50 text-amber-700" },
  processed: { label: "Confirmed", color: "bg-green-50 text-green-700" },
  needs_info: { label: "Needs Info", color: "bg-orange-50 text-orange-700" },
};

export default function EnrolmentsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading } = useEnrolments(activeTab);

  const submissions = data?.submissions || [];
  const filtered = search
    ? submissions.filter((s) => {
        const pp = s.primaryParent;
        const q = search.toLowerCase();
        const parentMatch = `${pp.firstName} ${pp.surname}`.toLowerCase().includes(q) || pp.email?.toLowerCase().includes(q);
        const childMatch = s.children.some((c) =>
          `${c.firstName} ${c.surname}`.toLowerCase().includes(q)
        );
        return parentMatch || childMatch;
      })
    : submissions;

  const counts = {
    all: data?.total || 0,
    submitted: submissions.filter((s) => s.status === "submitted").length,
    reviewing: submissions.filter((s) => s.status === "reviewing").length,
    processed: submissions.filter((s) => s.status === "processed").length,
    needs_info: submissions.filter((s) => s.status === "needs_info").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-brand" />
            Enrolments
          </h1>
          <p className="text-sm text-foreground/50 mt-1">
            Review and process parent enrolment submissions
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", count: counts.all, color: "text-brand" },
          { label: "Pending Review", count: counts.submitted, color: "text-blue-600" },
          { label: "In Review", count: counts.reviewing, color: "text-amber-600" },
          { label: "Confirmed", count: counts.processed, color: "text-green-600" },
        ].map((stat) => (
          <div key={stat.label} className="bg-background border border-border rounded-xl p-4">
            <p className="text-xs text-foreground/50">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.count}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-surface rounded-xl p-1 overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-foreground/50 hover:text-foreground"
              }`}
            >
              {tab.label}
              {counts[tab.key as keyof typeof counts] > 0 && (
                <span className="ml-1.5 text-foreground/30">
                  {counts[tab.key as keyof typeof counts]}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            aria-label="Search enrolments"
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-background border border-border rounded-xl p-12 text-center">
          <ClipboardList className="h-12 w-12 text-foreground/20 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground mb-1">No Enrolments</h3>
          <p className="text-sm text-foreground/50">
            {search
              ? "No enrolments match your search."
              : "Enrolment submissions will appear here when parents complete the form."}
          </p>
        </div>
      ) : (
        <div className="bg-background border border-border rounded-xl overflow-hidden">
          {/* Desktop header */}
          <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-2.5 bg-surface/50 text-xs font-medium text-foreground/50 border-b border-border">
            <div className="col-span-3">Parent</div>
            <div className="col-span-3">Children</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {filtered.map((s) => (
            <EnrolmentRow key={s.id} submission={s} onClick={() => setSelectedId(s.id)} />
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selectedId && (
        <EnrolmentDetailPanel
          enrolmentId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function EnrolmentRow({
  submission: s,
  onClick,
}: {
  submission: EnrolmentSubmission;
  onClick: () => void;
}) {
  const pp = s.primaryParent;
  const childNames = s.children.map((c) => c.firstName).join(", ");
  const badge = STATUS_BADGE[s.status] || STATUS_BADGE.submitted;

  return (
    <button
      onClick={onClick}
      className="w-full grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-4 py-3.5 text-left border-b border-border last:border-b-0 hover:bg-surface/30 transition-colors"
    >
      {/* Parent */}
      <div className="sm:col-span-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-brand" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {pp.firstName} {pp.surname}
            </p>
            <p className="text-xs text-foreground/50 truncate">{pp.email}</p>
          </div>
        </div>
      </div>

      {/* Children */}
      <div className="sm:col-span-3 flex items-center gap-1.5">
        <Baby className="h-3.5 w-3.5 text-foreground/30 shrink-0 hidden sm:block" />
        <span className="text-sm text-foreground/70 truncate">
          {childNames}
          {s.children.length > 1 && (
            <span className="text-foreground/40 ml-1">({s.children.length})</span>
          )}
        </span>
      </div>

      {/* Date */}
      <div className="sm:col-span-2 flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 text-foreground/30 shrink-0 hidden sm:block" />
        <span className="text-xs text-foreground/50">
          {new Date(s.createdAt).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
          })}
        </span>
      </div>

      {/* Status */}
      <div className="sm:col-span-2 flex items-center">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>
          {badge.label}
        </span>
      </div>

      {/* Actions */}
      <div className="sm:col-span-2 flex items-center justify-end">
        <a
          href={`/api/enrolments/${s.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 px-2 py-1 text-xs text-brand hover:bg-brand/5 rounded-lg transition-colors"
        >
          <Download className="h-3 w-3" />
          PDF
        </a>
      </div>
    </button>
  );
}

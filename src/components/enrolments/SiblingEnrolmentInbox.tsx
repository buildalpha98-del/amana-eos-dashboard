"use client";

import { useState } from "react";
import {
  Search,
  Baby,
  Calendar,
  Clock,
  UserPlus,
} from "lucide-react";
import {
  useEnrolmentApplications,
  type EnrolmentApplicationSummary,
} from "@/hooks/useEnrolmentApplications";
import { useServices } from "@/hooks/useServices";
import { SiblingApplicationReviewPanel } from "./SiblingApplicationReviewPanel";
import { Skeleton } from "@/components/ui/Skeleton";

const STATUS_TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "declined", label: "Declined" },
  { key: "withdrawn", label: "Withdrawn" },
  { key: "all", label: "All" },
];

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-amber-50 text-amber-700" },
  approved: { label: "Approved", color: "bg-green-50 text-green-700" },
  declined: { label: "Declined", color: "bg-red-50 text-red-700" },
  withdrawn: { label: "Withdrawn", color: "bg-gray-50 text-gray-500" },
};

const SESSION_LABELS: Record<string, string> = {
  BSC: "BSC",
  ASC: "ASC",
  VAC: "VAC",
};

function calculateAge(dob: string): string {
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years--;
  return `${years}y`;
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

export function SiblingEnrolmentInbox() {
  const [activeTab, setActiveTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useEnrolmentApplications(activeTab, serviceFilter || undefined);
  const { data: servicesData } = useServices("active");

  const applications = data?.applications ?? [];
  const filtered = search
    ? applications.filter((a) => {
        const q = search.toLowerCase();
        return (
          `${a.childFirstName} ${a.childLastName}`.toLowerCase().includes(q) ||
          a.parentName.toLowerCase().includes(q) ||
          a.parentEmail.toLowerCase().includes(q)
        );
      })
    : applications;

  const pendingCount = activeTab === "pending" ? data?.total ?? 0 : 0;

  return (
    <div className="space-y-4">
      {/* Header stat */}
      {pendingCount > 0 && activeTab === "pending" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <UserPlus className="h-5 w-5 text-amber-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {pendingCount} pending sibling enrolment{pendingCount !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-amber-700">
              Review and approve sibling applications
            </p>
          </div>
        </div>
      )}

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
            </button>
          ))}
        </div>

        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-brand/30"
        >
          <option value="">All Services</option>
          {(servicesData ?? []).map((s: { id: string; name: string }) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            aria-label="Search sibling applications"
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
      </div>

      {/* Applications list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-background border border-border rounded-xl p-12 text-center">
          <UserPlus className="h-12 w-12 text-foreground/20 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground mb-1">
            No Applications
          </h3>
          <p className="text-sm text-foreground/50">
            {search
              ? "No applications match your search."
              : `No ${activeTab === "all" ? "" : activeTab + " "}sibling enrolment applications.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              onClick={() => setSelectedId(app.id)}
            />
          ))}
        </div>
      )}

      {/* Review panel */}
      {selectedId && (
        <SiblingApplicationReviewPanel
          applicationId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ── Application Card ────────────────────────────────────────

function ApplicationCard({
  app,
  onClick,
}: {
  app: EnrolmentApplicationSummary;
  onClick: () => void;
}) {
  const badge = STATUS_BADGE[app.status] || STATUS_BADGE.pending;

  return (
    <button
      onClick={onClick}
      className="w-full bg-background border border-border rounded-xl p-4 text-left hover:shadow-md hover:border-brand/20 transition-all active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Baby className="h-4 w-4 text-brand shrink-0" />
            <h4 className="text-sm font-semibold text-foreground truncate">
              {app.childFirstName} {app.childLastName}
            </h4>
            <span className="text-xs text-foreground/40">
              {calculateAge(app.childDateOfBirth)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/50">
            <span>{app.serviceName}</span>
            <span className="hidden sm:inline">|</span>
            <div className="flex gap-1">
              {app.sessionTypes.map((st) => (
                <span
                  key={st}
                  className="px-1.5 py-0.5 bg-brand/10 text-brand text-[10px] font-medium rounded"
                >
                  {SESSION_LABELS[st] || st}
                </span>
              ))}
            </div>
            {app.startDate && (
              <>
                <span className="hidden sm:inline">|</span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Start: {new Date(app.startDate).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 mt-2 text-xs text-foreground/40">
            <span>
              Submitted by {app.parentName} ({app.parentEmail})
            </span>
            <span className="hidden sm:inline">|</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeAgo(app.createdAt)}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>
            {badge.label}
          </span>
          {app.status === "pending" && (
            <span className="text-xs font-medium text-brand">Review</span>
          )}
        </div>
      </div>
    </button>
  );
}

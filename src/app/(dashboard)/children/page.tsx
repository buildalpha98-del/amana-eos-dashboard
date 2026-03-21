"use client";

import { useState } from "react";
import {
  Baby,
  Search,
  User,
  Building2,
  Calendar,
  Heart,
  AlertTriangle,
} from "lucide-react";
import { useChildren, type ChildRecord } from "@/hooks/useChildren";
import { ChildDetailPanel } from "@/components/children/ChildDetailPanel";
import { Skeleton } from "@/components/ui/Skeleton";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending" },
  { key: "withdrawn", label: "Withdrawn" },
];

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-amber-50 text-amber-700" },
  active: { label: "Active", color: "bg-green-50 text-green-700" },
  withdrawn: { label: "Withdrawn", color: "bg-red-50 text-red-700" },
};

export default function ChildrenPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading } = useChildren({ status: activeTab, search: search || undefined });

  const children = data?.children || [];

  const counts = {
    all: data?.total || 0,
    active: children.filter((c) => c.status === "active").length,
    pending: children.filter((c) => c.status === "pending").length,
    withdrawn: children.filter((c) => c.status === "withdrawn").length,
  };

  // Medical flags
  const medicalFlags = children.filter((c) => {
    const med = c.medical as Record<string, unknown> | null;
    return med && (med.anaphylaxisRisk || med.allergies || med.asthma);
  }).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Baby className="h-6 w-6 text-brand" />
            Children Directory
          </h1>
          <p className="text-sm text-foreground/50 mt-1">
            All enrolled children across your services
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Children", count: counts.all, color: "text-brand", icon: Baby },
          { label: "Active", count: counts.active, color: "text-green-600", icon: User },
          { label: "Pending", count: counts.pending, color: "text-amber-600", icon: Calendar },
          { label: "Medical Alerts", count: medicalFlags, color: "text-red-600", icon: AlertTriangle },
        ].map((stat) => (
          <div key={stat.label} className="bg-background border border-border rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <stat.icon className="h-3.5 w-3.5 text-foreground/30" />
              <p className="text-xs text-foreground/50">{stat.label}</p>
            </div>
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
            placeholder="Search by name or school..."
            aria-label="Search children"
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : children.length === 0 ? (
        <div className="bg-background border border-border rounded-xl p-12 text-center">
          <Baby className="h-12 w-12 text-foreground/20 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground mb-1">No Children Found</h3>
          <p className="text-sm text-foreground/50">
            {search
              ? "No children match your search."
              : "Children will appear here when parents submit enrolment forms."}
          </p>
        </div>
      ) : (
        <div className="bg-background border border-border rounded-xl overflow-hidden">
          {/* Desktop header */}
          <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-2.5 bg-surface/50 text-xs font-medium text-foreground/50 border-b border-border">
            <div className="col-span-3">Child</div>
            <div className="col-span-2">Parent</div>
            <div className="col-span-2">Service</div>
            <div className="col-span-2">Age / School</div>
            <div className="col-span-1">Medical</div>
            <div className="col-span-2">Status</div>
          </div>

          {children.map((child) => (
            <ChildRow key={child.id} child={child} onClick={() => setSelectedId(child.id)} />
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selectedId && (
        <ChildDetailPanel
          childId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function ChildRow({ child, onClick }: { child: ChildRecord; onClick: () => void }) {
  const badge = STATUS_BADGE[child.status] || STATUS_BADGE.pending;
  const pp = child.enrolment?.primaryParent;
  const med = child.medical as Record<string, unknown> | null;
  const hasMedicalFlag = med && (med.anaphylaxisRisk || med.allergies || med.asthma);
  const age = child.dob ? calculateAge(child.dob) : null;

  return (
    <button
      onClick={onClick}
      className="w-full grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-4 py-3.5 text-left border-b border-border last:border-b-0 hover:bg-surface/30 transition-colors"
    >
      {/* Child name */}
      <div className="sm:col-span-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
            <Baby className="h-4 w-4 text-brand" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {child.firstName} {child.surname}
            </p>
            {child.gender && (
              <p className="text-xs text-foreground/40">{child.gender}</p>
            )}
          </div>
        </div>
      </div>

      {/* Parent */}
      <div className="sm:col-span-2 flex items-center gap-1.5">
        <User className="h-3.5 w-3.5 text-foreground/30 shrink-0 hidden sm:block" />
        <span className="text-xs text-foreground/60 truncate">
          {pp ? `${pp.firstName} ${pp.surname}` : "—"}
        </span>
      </div>

      {/* Service */}
      <div className="sm:col-span-2 flex items-center gap-1.5">
        <Building2 className="h-3.5 w-3.5 text-foreground/30 shrink-0 hidden sm:block" />
        <span className="text-xs text-foreground/60 truncate">
          {child.service?.name || "Unassigned"}
        </span>
      </div>

      {/* Age / School */}
      <div className="sm:col-span-2 flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 text-foreground/30 shrink-0 hidden sm:block" />
        <span className="text-xs text-foreground/50 truncate">
          {age || "—"}
          {child.schoolName && ` · ${child.schoolName}`}
        </span>
      </div>

      {/* Medical flags */}
      <div className="sm:col-span-1 flex items-center">
        {hasMedicalFlag ? (
          <span className="flex items-center gap-1 text-xs text-red-600">
            <Heart className="h-3.5 w-3.5 fill-red-100" />
            Alert
          </span>
        ) : (
          <span className="text-xs text-foreground/30">—</span>
        )}
      </div>

      {/* Status */}
      <div className="sm:col-span-2 flex items-center">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>
          {badge.label}
        </span>
      </div>
    </button>
  );
}

function calculateAge(dob: string): string {
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years--;
  return `${years} yrs`;
}

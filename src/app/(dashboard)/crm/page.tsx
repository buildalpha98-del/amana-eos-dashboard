"use client";

import { useState } from "react";
import { useLeads } from "@/hooks/useCRM";
import type { LeadSummary, LeadFilters } from "@/hooks/useCRM";
import { CrmKanban } from "@/components/crm/CrmKanban";
import { LeadTable } from "@/components/crm/LeadTable";
import { LeadDetailDrawer } from "@/components/crm/LeadDetailDrawer";
import { CreateLeadModal } from "@/components/crm/CreateLeadModal";
import { SendEmailModal } from "@/components/crm/SendEmailModal";
import { ScraperStatusWidget } from "@/components/crm/ScraperStatusWidget";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useQuery } from "@tanstack/react-query";
import {
  Target,
  Plus,
  Search,
  LayoutGrid,
  List,
  SlidersHorizontal,
  X,
} from "lucide-react";

const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

const stageTabs = [
  { key: "", label: "All" },
  { key: "new_lead", label: "New Lead" },
  { key: "reviewing", label: "Reviewing" },
  { key: "contact_made", label: "Contact Made" },
  { key: "follow_up_1", label: "Follow-up 1" },
  { key: "follow_up_2", label: "Follow-up 2" },
  { key: "meeting_booked", label: "Meeting" },
  { key: "proposal_sent", label: "Proposal" },
  { key: "submitted", label: "Submitted" },
  { key: "negotiating", label: "Negotiating" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "on_hold", label: "On Hold" },
];

const sourceOptions = [
  { key: "", label: "All Sources" },
  { key: "direct", label: "Direct" },
  { key: "tender", label: "Tender" },
];

interface UserOption {
  id: string;
  name: string;
}

export default function CrmPage() {
  const [view, setView] = useState<"pipeline" | "table">("pipeline");
  const [filters, setFilters] = useState<LeadFilters>({});
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<LeadSummary | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showSendEmail, setShowSendEmail] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = [filters.source, filters.state, filters.assigneeId, filters.stage].filter(Boolean).length;

  const activeFilters: LeadFilters = {
    ...filters,
    search: search || undefined,
  };

  const { data: leads, isLoading } = useLeads(activeFilters);
  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const handleLeadClick = (lead: LeadSummary) => {
    setSelectedLead(lead);
  };

  // Stats
  const total = leads?.length || 0;
  const activeLeads = leads?.filter((l) =>
    !["won", "lost", "on_hold"].includes(l.pipelineStage)
  ).length || 0;
  const wonCount = leads?.filter((l) => l.pipelineStage === "won").length || 0;
  const tenderCount = leads?.filter((l) => l.source === "tender").length || 0;

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">CRM</h2>
          <p className="text-gray-500 mt-1 line-clamp-2">
            Sales pipeline & lead management
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ScraperStatusWidget />
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Lead
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Leads" value={total} />
        <StatCard title="Active" value={activeLeads} valueColor="text-blue-600" />
        <StatCard title="Won" value={wonCount} valueColor="text-emerald-600" />
        <StatCard title="Tenders" value={tenderCount} valueColor="text-indigo-600" />
      </div>

      {/* Filters Bar */}
      <div className="space-y-3">
        {/* Always-visible row: view toggle, mobile filter button, search */}
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setView("pipeline")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                view === "pipeline"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5 inline mr-1" />
              Pipeline
            </button>
            <button
              onClick={() => setView("table")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                view === "table"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              <List className="w-3.5 h-3.5 inline mr-1" />
              Table
            </button>
          </div>

          {/* Mobile filter toggle (hidden on sm+) */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              "sm:hidden inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors",
              showFilters || activeFilterCount > 0
                ? "bg-[#004E64] text-white border-[#004E64]"
                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
            )}
          >
            {showFilters ? (
              <X className="w-3.5 h-3.5" />
            ) : (
              <SlidersHorizontal className="w-3.5 h-3.5" />
            )}
            Filters
            {activeFilterCount > 0 && !showFilters && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/20 text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Desktop filters (hidden on mobile) */}
          <div className="hidden sm:flex items-center gap-3">
            {/* Source filter */}
            <select
              value={filters.source || ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, source: e.target.value || undefined }))
              }
              className="border rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#003344]"
            >
              {sourceOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>

            {/* State filter */}
            <select
              value={filters.state || ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, state: e.target.value || undefined }))
              }
              className="border rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#003344]"
            >
              <option value="">All States</option>
              {AU_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {/* Assignee filter */}
            <select
              value={filters.assigneeId || ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, assigneeId: e.target.value || undefined }))
              }
              className="border rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#003344]"
            >
              <option value="">All Assignees</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>

            {/* Stage filter (for table view) */}
            {view === "table" && (
              <select
                value={filters.stage || ""}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, stage: e.target.value || undefined }))
                }
                className="border rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-[#003344]"
              >
                {stageTabs.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-xs ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
            />
          </div>
        </div>

        {/* Mobile collapsible filter dropdowns (visible only on mobile when toggled) */}
        {showFilters && (
          <div className="sm:hidden flex flex-col gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
            {/* Source filter */}
            <select
              value={filters.source || ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, source: e.target.value || undefined }))
              }
              className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#003344]"
            >
              {sourceOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>

            {/* State filter */}
            <select
              value={filters.state || ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, state: e.target.value || undefined }))
              }
              className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#003344]"
            >
              <option value="">All States</option>
              {AU_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {/* Assignee filter */}
            <select
              value={filters.assigneeId || ""}
              onChange={(e) =>
                setFilters((f) => ({ ...f, assigneeId: e.target.value || undefined }))
              }
              className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#003344]"
            >
              <option value="">All Assignees</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>

            {/* Stage filter (for table view) */}
            {view === "table" && (
              <select
                value={filters.stage || ""}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, stage: e.target.value || undefined }))
                }
                className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#003344]"
              >
                {stageTabs.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}

            {/* Clear filters shortcut */}
            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  setFilters({});
                  setShowFilters(false);
                }}
                className="text-xs text-gray-500 hover:text-gray-700 underline self-end mt-1"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-[#004E64] border-t-transparent rounded-full" />
        </div>
      ) : leads && leads.length > 0 ? (
        view === "pipeline" ? (
          <CrmKanban leads={leads} onLeadClick={handleLeadClick} />
        ) : (
          <LeadTable leads={leads} onLeadClick={handleLeadClick} />
        )
      ) : (
        <EmptyState
          icon={Target}
          title="No leads found"
          description={
            search || filters.source || filters.state || filters.assigneeId
              ? "Try adjusting your filters"
              : "Create your first lead to get started"
          }
          variant="inline"
          {...(!search && !filters.source && !filters.state && {
            action: { label: "New Lead", onClick: () => setShowCreate(true) },
          })}
        />
      )}

      {/* Lead Detail Drawer */}
      {selectedLead && (
        <LeadDetailDrawer
          leadId={selectedLead.id}
          onClose={() => setSelectedLead(null)}
          onSendEmail={() => setShowSendEmail(true)}
        />
      )}

      {/* Send Email Modal */}
      {selectedLead && (
        <SendEmailModal
          open={showSendEmail}
          onClose={() => setShowSendEmail(false)}
          leadId={selectedLead.id}
          contactEmail={selectedLead.contactEmail || ""}
          contactName={selectedLead.contactName}
        />
      )}

      {/* Create Lead Modal */}
      <CreateLeadModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  );
}

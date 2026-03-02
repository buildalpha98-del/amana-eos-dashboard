"use client";

import { useState, useMemo } from "react";
import { useTickets } from "@/hooks/useTickets";
import { useTicketAnalytics } from "@/hooks/useTicketAnalytics";
import { useQuery } from "@tanstack/react-query";
import { TicketCard } from "@/components/tickets/TicketCard";
import { TicketDetailPanel } from "@/components/tickets/TicketDetailPanel";
import { CreateTicketModal } from "@/components/tickets/CreateTicketModal";
import { ResponseTemplateManager } from "@/components/tickets/ResponseTemplateManager";
import { TicketVolumeTrendChart } from "@/components/charts/TicketVolumeTrendChart";
import { TicketPriorityChart } from "@/components/charts/TicketPriorityChart";
import { AgentWorkloadChart } from "@/components/charts/AgentWorkloadChart";
import { ExportButton } from "@/components/ui/ExportButton";
import { exportToCSV, formatDateCSV } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Plus,
  Filter,
  LayoutGrid,
  List,
  Search,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  BarChart3,
  FileText,
} from "lucide-react";

interface UserOption {
  id: string;
  name: string;
}

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

const statusTabs = [
  { key: "", label: "All", icon: null },
  { key: "new", label: "New", icon: AlertTriangle, color: "text-blue-600" },
  { key: "open", label: "Open", icon: Clock, color: "text-amber-600" },
  { key: "pending_parent", label: "Pending", icon: Clock, color: "text-purple-600" },
  { key: "resolved", label: "Resolved", icon: CheckCircle, color: "text-emerald-600" },
  { key: "closed", label: "Closed", icon: XCircle, color: "text-gray-400" },
] as const;

export default function TicketsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"board" | "list" | "analytics">("list");
  const [analyticsDays, setAnalyticsDays] = useState(30);

  const { data: tickets, isLoading } = useTickets({
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(priorityFilter ? { priority: priorityFilter } : {}),
    ...(assigneeFilter ? { assignedToId: assigneeFilter } : {}),
    ...(serviceFilter ? { serviceId: serviceFilter } : {}),
    ...(searchTerm ? { search: searchTerm } : {}),
  });

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: services = [] } = useQuery<ServiceOption[]>({
    queryKey: ["services"],
    queryFn: async () => {
      const res = await fetch("/api/services");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: analytics, isLoading: analyticsLoading } = useTicketAnalytics(
    analyticsDays,
    viewMode === "analytics"
  );

  // Compute stats
  const stats = useMemo(() => {
    if (!tickets) return { total: 0, new: 0, open: 0, pending: 0, resolved: 0 };
    return {
      total: tickets.length,
      new: tickets.filter((t) => t.status === "new").length,
      open: tickets.filter((t) => t.status === "open").length,
      pending: tickets.filter((t) => t.status === "pending_parent").length,
      resolved: tickets.filter((t) => t.status === "resolved").length,
    };
  }, [tickets]);

  // Board columns
  const boardColumns = useMemo(() => {
    if (!tickets) return { new: [], open: [], pending_parent: [], resolved: [], closed: [] };
    return {
      new: tickets.filter((t) => t.status === "new"),
      open: tickets.filter((t) => t.status === "open"),
      pending_parent: tickets.filter((t) => t.status === "pending_parent"),
      resolved: tickets.filter((t) => t.status === "resolved"),
      closed: tickets.filter((t) => t.status === "closed"),
    };
  }, [tickets]);

  const hasActiveFilters = priorityFilter || assigneeFilter || serviceFilter;

  const handleExport = () => {
    if (!tickets || tickets.length === 0) return;
    exportToCSV(
      tickets.map((t: any) => ({
        ticketNumber: t.ticketNumber,
        subject: t.subject || "",
        contact: t.contact?.parentName || t.contact?.name || t.contact?.phoneNumber || "",
        status: t.status,
        priority: t.priority,
        assignedTo: t.assignedTo?.name || "Unassigned",
        centre: t.service?.name || "",
        created: t.createdAt,
        firstResponse: t.firstResponseAt || "",
        resolved: t.resolvedAt || "",
      })),
      "tickets-export",
      [
        { key: "ticketNumber", header: "Ticket #" },
        { key: "subject", header: "Subject" },
        { key: "contact", header: "Contact" },
        { key: "status", header: "Status" },
        { key: "priority", header: "Priority" },
        { key: "assignedTo", header: "Assigned To" },
        { key: "centre", header: "Centre" },
        { key: "created", header: "Created", formatter: (v) => v ? formatDateCSV(v as string) : "" },
        { key: "firstResponse", header: "First Response", formatter: (v) => v ? formatDateCSV(v as string) : "" },
        { key: "resolved", header: "Resolved", formatter: (v) => v ? formatDateCSV(v as string) : "" },
      ]
    );
  };

  const boardConfig = [
    { key: "new" as const, label: "New", color: "border-blue-400", icon: AlertTriangle, iconColor: "text-blue-500" },
    { key: "open" as const, label: "Open", color: "border-amber-400", icon: Clock, iconColor: "text-amber-500" },
    { key: "pending_parent" as const, label: "Pending Parent", color: "border-purple-400", icon: Clock, iconColor: "text-purple-500" },
    { key: "resolved" as const, label: "Resolved", color: "border-emerald-400", icon: CheckCircle, iconColor: "text-emerald-500" },
    { key: "closed" as const, label: "Closed", color: "border-gray-300", icon: XCircle, iconColor: "text-gray-400" },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Support Tickets</h2>
          <p className="text-gray-500 mt-1">
            Manage parent enquiries and WhatsApp conversations
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Export */}
          <ExportButton onClick={handleExport} disabled={!tickets || tickets.length === 0} />

          {/* View Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("board")}
              className={cn(
                "p-2 rounded-md transition-colors",
                viewMode === "board"
                  ? "bg-white text-[#004E64] shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-2 rounded-md transition-colors",
                viewMode === "list"
                  ? "bg-white text-[#004E64] shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("analytics")}
              className={cn(
                "p-2 rounded-md transition-colors",
                viewMode === "analytics"
                  ? "bg-white text-[#004E64] shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              <BarChart3 className="w-4 h-4" />
            </button>
          </div>

          {/* Filters Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "p-2 rounded-lg border transition-colors",
              showFilters || hasActiveFilters
                ? "bg-[#004E64] text-white border-[#004E64]"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            )}
          >
            <Filter className="w-4 h-4" />
          </button>

          {/* Templates */}
          <button
            onClick={() => setShowTemplates(true)}
            className="inline-flex items-center gap-2 px-3 py-2.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Templates</span>
          </button>

          {/* Create */}
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Ticket
          </button>
        </div>
      </div>

      {/* Search Bar */}
      {viewMode !== "analytics" && (
        <div className="mb-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search tickets by subject or contact..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
            />
          </div>
        </div>
      )}

      {/* Status Tabs (List View) */}
      {viewMode === "list" && (
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
          {statusTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  statusFilter === tab.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {Icon && <Icon className={cn("w-3.5 h-3.5", tab.color)} />}
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Advanced Filters */}
      {showFilters && viewMode !== "analytics" && (
        <div className="mb-4 flex flex-wrap items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
          >
            <option value="">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
          >
            <option value="">All Assignees</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
          >
            <option value="">All Centres</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {hasActiveFilters && (
            <button
              onClick={() => {
                setPriorityFilter("");
                setAssigneeFilter("");
                setServiceFilter("");
              }}
              className="text-xs text-[#004E64] hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Stats Bar */}
      {viewMode !== "analytics" && tickets && tickets.length > 0 && (
        <div className="flex items-center gap-4 mb-4 px-1">
          <span className="text-sm text-gray-500">
            <span className="font-semibold text-gray-900">{stats.total}</span> tickets
          </span>
          {stats.new > 0 && (
            <span className="text-sm text-blue-600">
              <span className="font-semibold">{stats.new}</span> new
            </span>
          )}
          {stats.open > 0 && (
            <span className="text-sm text-amber-600">
              <span className="font-semibold">{stats.open}</span> open
            </span>
          )}
          {stats.pending > 0 && (
            <span className="text-sm text-purple-600">
              <span className="font-semibold">{stats.pending}</span> pending
            </span>
          )}
        </div>
      )}

      {/* Content */}
      {viewMode === "analytics" ? (
        /* Analytics View */
        <div className="space-y-6">
          {/* Days Range Selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">Period:</span>
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setAnalyticsDays(d)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                  analyticsDays === d
                    ? "bg-[#004E64] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                {d} days
              </button>
            ))}
          </div>

          {analyticsLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <div className="w-10 h-10 border-4 border-gray-200 border-t-[#004E64] rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-500">Loading analytics...</p>
              </div>
            </div>
          ) : analytics ? (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-medium text-gray-500">Total Tickets</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {analytics.totalTickets}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-medium text-gray-500">Avg First Response</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {analytics.avgFirstResponseHours !== null
                      ? `${analytics.avgFirstResponseHours}h`
                      : "--"}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-medium text-gray-500">Avg Resolution</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {analytics.avgResolutionHours !== null
                      ? `${analytics.avgResolutionHours}h`
                      : "--"}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-medium text-gray-500">Open Tickets</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {(analytics.byStatus["new"] || 0) +
                      (analytics.byStatus["open"] || 0) +
                      (analytics.byStatus["pending_parent"] || 0)}
                  </p>
                </div>
              </div>

              {/* Charts */}
              <TicketVolumeTrendChart data={analytics.volumeTrend} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TicketPriorityChart data={analytics.byPriority} />
                <AgentWorkloadChart data={analytics.agentWorkload} />
              </div>
            </>
          ) : null}
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-[#004E64] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading tickets...</p>
          </div>
        </div>
      ) : tickets && tickets.length > 0 ? (
        viewMode === "board" ? (
          /* Board View */
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {boardConfig.map((col) => {
              const Icon = col.icon;
              const items = boardColumns[col.key];
              return (
                <div key={col.key} className="space-y-3">
                  <div className={cn("flex items-center gap-2 pb-2 border-b-2", col.color)}>
                    <Icon className={cn("w-4 h-4", col.iconColor)} />
                    <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
                    <span className="text-xs text-gray-400 ml-auto bg-gray-100 px-1.5 py-0.5 rounded-full">
                      {items.length}
                    </span>
                  </div>
                  {items.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-8">No tickets</p>
                  ) : (
                    items.map((ticket) => (
                      <TicketCard
                        key={ticket.id}
                        ticket={ticket}
                        onClick={() => setSelectedId(ticket.id)}
                      />
                    ))
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onClick={() => setSelectedId(ticket.id)}
              />
            ))}
          </div>
        )
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
            <MessageSquare className="w-8 h-8 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            No support tickets
          </h3>
          <p className="text-sm text-gray-500 max-w-sm mb-4">
            When parents message you on WhatsApp, their conversations will appear here
            as support tickets. You can also create tickets manually.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create First Ticket
          </button>
        </div>
      )}

      {/* Create Modal */}
      <CreateTicketModal open={showCreate} onClose={() => setShowCreate(false)} />
      <ResponseTemplateManager open={showTemplates} onClose={() => setShowTemplates(false)} />

      {/* Detail Panel */}
      {selectedId && (
        <TicketDetailPanel
          ticketId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

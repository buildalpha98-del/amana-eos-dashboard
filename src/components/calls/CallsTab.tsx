"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/Sheet";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import {
  Phone,
  PhoneIncoming,
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  X,
  Play,
  ChevronDown,
  ChevronUp,
  Mail,
  Bell,
  User,
  ChevronRight,
} from "lucide-react";
import { toast } from "@/hooks/useToast";

// ─── Types ──────────────────────────────────────────────────

interface VapiCall {
  id: string;
  vapiCallId?: string;
  callType: string;
  urgency: string;
  status: string;
  assignedTo?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  childName?: string;
  centreName?: string;
  callDetails?: Record<string, unknown>;
  transcript?: string;
  summary?: string;
  successEvaluation?: boolean;
  recordingUrl?: string;
  callDurationSeconds?: number;
  followUpEmailSent: boolean;
  internalNotificationSent: boolean;
  slaAlertedAt?: string;
  linkedEnquiryId?: string;
  linkedTodoId?: string;
  notes?: string;
  actionedAt?: string;
  actionedBy?: string;
  calledAt: string;
  createdAt: string;
}

interface CallStats {
  todayTotal: number;
  awaitingAction: number;
  urgentCritical: number;
  actionedToday: number;
}

// ─── Constants ──────────────────────────────────────────────

const CALL_TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "new_enquiry", label: "New Enquiry" },
  { value: "booking_change", label: "Booking Change" },
  { value: "billing_issue", label: "Billing Issue" },
  { value: "escalation", label: "Escalation" },
  { value: "holiday_quest", label: "Holiday Quest" },
  { value: "general_message", label: "General" },
];

const URGENCY_OPTIONS = [
  { value: "", label: "All Urgency" },
  { value: "routine", label: "Routine" },
  { value: "urgent", label: "Urgent" },
  { value: "critical", label: "Critical" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "new", label: "New" },
  { value: "in_progress", label: "In Progress" },
  { value: "actioned", label: "Actioned" },
  { value: "closed", label: "Closed" },
];

const CENTRE_NAMES = [
  "MFIS Greenacre",
  "MFIS Hoxton Park",
  "MFIS Beaumont Hills",
  "Arkana College",
  "Unity Grammar",
  "Al-Taqwa College",
  "Minaret Officer",
  "Minaret Springvale",
  "Minaret Doveton",
  "AIA KKCC",
];

const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "", label: "All Time" },
];

const TEAM_MEMBERS = ["Akram", "Jayden", "Mirna", "Tracie", "Daniel"];

const CALL_TYPE_LABELS: Record<string, string> = {
  new_enquiry: "New Enquiry",
  booking_change: "Booking Change",
  billing_issue: "Billing Issue",
  escalation: "Escalation",
  holiday_quest: "Holiday Quest",
  general_message: "General",
};

const CALL_TYPE_COLORS: Record<string, string> = {
  new_enquiry: "bg-emerald-100 text-emerald-800",
  booking_change: "bg-[#004E64]/10 text-[#004E64]",
  billing_issue: "bg-orange-100 text-orange-800",
  escalation: "bg-red-100 text-red-800",
  holiday_quest: "bg-purple-100 text-purple-800",
  general_message: "bg-gray-100 text-gray-700",
};

const URGENCY_COLORS: Record<string, string> = {
  routine: "bg-gray-100 text-gray-700",
  urgent: "bg-[#FECE00]/20 text-amber-900",
  critical: "bg-red-100 text-red-800",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  actioned: "bg-emerald-100 text-emerald-800",
  closed: "bg-gray-100 text-gray-700",
};

// ─── Helpers ────────────────────────────────────────────────

function humaniseKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function getDateRange(preset: string): { dateFrom?: string; dateTo?: string } {
  if (!preset) return {};
  const now = new Date();
  const sydneyNow = new Date(now.toLocaleString("en-US", { timeZone: "Australia/Sydney" }));

  if (preset === "today") {
    const start = new Date(sydneyNow);
    start.setHours(0, 0, 0, 0);
    return { dateFrom: start.toISOString() };
  }
  if (preset === "week") {
    const start = new Date(sydneyNow);
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday start
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return { dateFrom: start.toISOString() };
  }
  if (preset === "month") {
    const start = new Date(sydneyNow.getFullYear(), sydneyNow.getMonth(), 1);
    return { dateFrom: start.toISOString() };
  }
  return {};
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Component ──────────────────────────────────────────────

export function CallsTab() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get("id");

  // Filters
  const [callTypeFilter, setCallTypeFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [centreFilter, setCentreFilter] = useState("");
  const [datePreset, setDatePreset] = useState("today");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCall, setSelectedCall] = useState<VapiCall | null>(null);
  const [lastUpdated, setLastUpdated] = useState(Date.now());


  // Build query params
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (callTypeFilter) params.set("callType", callTypeFilter);
    if (urgencyFilter) params.set("urgency", urgencyFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (centreFilter) params.set("centreName", centreFilter);
    if (searchTerm) params.set("search", searchTerm);
    const dateRange = getDateRange(datePreset);
    if (dateRange.dateFrom) params.set("dateFrom", dateRange.dateFrom);
    if (dateRange.dateTo) params.set("dateTo", dateRange.dateTo);
    return params.toString();
  }, [callTypeFilter, urgencyFilter, statusFilter, centreFilter, datePreset, searchTerm]);

  // Fetch calls
  const { data: callsData, isLoading: callsLoading } = useQuery<{ calls: VapiCall[]; total: number }>({
    queryKey: ["vapi-calls", queryParams],
    queryFn: () => fetchApi(`/api/calls?${queryParams}`),
    retry: 2,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // Track last updated
  useEffect(() => {
    if (callsData) setLastUpdated(Date.now());
  }, [callsData]);

  const calls = callsData?.calls ?? [];

  // Auto-open deep-linked call once the list loads
  useEffect(() => {
    if (deepLinkId && calls.length > 0 && !selectedCall) {
      const found = calls.find((c) => c.id === deepLinkId);
      if (found) setSelectedCall(found);
    }
  }, [deepLinkId, calls, selectedCall]);

  // Fetch stats
  const { data: stats } = useQuery<CallStats>({
    queryKey: ["vapi-call-stats"],
    queryFn: () => fetchApi("/api/calls/stats"),
    retry: 2,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Update mutation
  const updateCall = useMutation({
    mutationFn: (args: { id: string; data: Record<string, unknown> }) =>
      mutateApi(`/api/calls/${args.id}`, { method: "PATCH", body: args.data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vapi-calls"] });
      queryClient.invalidateQueries({ queryKey: ["vapi-call-stats"] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Failed to update call" });
    },
  });

  const handleStatusChange = useCallback(
    (callId: string, newStatus: string) => {
      updateCall.mutate({ id: callId, data: { status: newStatus } });
    },
    [updateCall],
  );

  const handleAssignChange = useCallback(
    (callId: string, assignedTo: string) => {
      updateCall.mutate({ id: callId, data: { assignedTo } });
    },
    [updateCall],
  );

  // Time since last update
  const [timeSinceUpdate, setTimeSinceUpdate] = useState("just now");
  useEffect(() => {
    const interval = setInterval(() => {
      const seconds = Math.round((Date.now() - lastUpdated) / 1000);
      if (seconds < 10) setTimeSinceUpdate("just now");
      else if (seconds < 60) setTimeSinceUpdate(`${seconds}s ago`);
      else setTimeSinceUpdate(`${Math.floor(seconds / 60)}m ago`);
    }, 5000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  return (
    <div>
      {/* ── Summary Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Calls Today" value={stats?.todayTotal ?? 0} icon={Phone} color="text-[#004E64]" />
        <StatCard label="Awaiting Action" value={stats?.awaitingAction ?? 0} icon={PhoneIncoming} color="text-blue-600" />
        <StatCard label="Urgent / Critical" value={stats?.urgentCritical ?? 0} icon={AlertTriangle} color="text-red-600" />
        <StatCard label="Actioned Today" value={stats?.actionedToday ?? 0} icon={CheckCircle} color="text-emerald-600" />
      </div>

      {/* ── Filters ───────────────────────────────────────── */}
      <div className="space-y-2 mb-4">
        {/* Search — full width on mobile, top row */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search name, phone, child..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-9 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-muted hover:text-foreground" />
            </button>
          )}
        </div>
        {/* Filters — grid on mobile, flex on desktop */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          <FilterSelect value={callTypeFilter} onChange={setCallTypeFilter} options={CALL_TYPE_OPTIONS} />
          <FilterSelect value={urgencyFilter} onChange={setUrgencyFilter} options={URGENCY_OPTIONS} />
          <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
          <select
            value={centreFilter}
            onChange={(e) => setCentreFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">All Centres</option>
            {CENTRE_NAMES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div className="flex gap-1 bg-surface rounded-lg p-0.5 col-span-2 sm:col-span-1 sm:ml-auto">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setDatePreset(p.value)}
                className={cn(
                  "flex-1 sm:flex-none px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  datePreset === p.value ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Updated indicator ─────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3 text-xs text-muted">
        <Clock className="w-3 h-3" />
        Updated {timeSinceUpdate}
        {callsData && <span className="ml-auto">{callsData.total} call{callsData.total !== 1 ? "s" : ""}</span>}
      </div>

      {/* ── List ──────────────────────────────────────────── */}
      {callsLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-4 border-border border-t-brand rounded-full animate-spin" />
        </div>
      ) : calls.length === 0 ? (
        <div className="text-center py-20 text-muted">
          <Phone className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No calls found</p>
          <p className="text-sm mt-1">Adjust your filters or wait for new VAPI calls to come in.</p>
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="sm:hidden space-y-2">
            {calls.map((call) => (
              <button
                key={call.id}
                onClick={() => setSelectedCall(call)}
                className="w-full text-left bg-card border border-border rounded-xl p-3 hover:border-[#004E64]/40 active:scale-[0.99] transition"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex flex-wrap gap-1.5">
                    <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium", CALL_TYPE_COLORS[call.callType] ?? "bg-gray-100 text-gray-700")}>
                      {CALL_TYPE_LABELS[call.callType] ?? call.callType}
                    </span>
                    <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium", URGENCY_COLORS[call.urgency] ?? "bg-gray-100")}>
                      {call.urgency}
                    </span>
                    <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium", STATUS_COLORS[call.status] ?? "bg-gray-100")}>
                      {call.status.replace("_", " ")}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted mt-0.5" />
                </div>
                <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  {call.parentName || "Unknown caller"}
                  {call.childName && <span className="text-muted font-normal"> · {call.childName}</span>}
                  {call.successEvaluation === true && (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" aria-label="Call captured key details" />
                  )}
                  {call.successEvaluation === false && (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" aria-label="Call did not capture key details" />
                  )}
                  {call.linkedEnquiryId && (
                    <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700">Enquiry</span>
                  )}
                  {call.linkedTodoId && (
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700", !call.linkedEnquiryId && "ml-auto")}>Todo</span>
                  )}
                  {call.slaAlertedAt && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700">SLA</span>
                  )}
                </div>
                {call.summary && (
                  <p className="text-xs text-muted mt-1 line-clamp-2">{call.summary}</p>
                )}
                <div className="flex items-center justify-between mt-1 text-xs text-muted">
                  <span>{call.centreName || "—"}</span>
                  <span>
                    {formatDateTime(call.calledAt)}
                    {call.callDurationSeconds != null && ` · ${formatDuration(call.callDurationSeconds)}`}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted uppercase tracking-wide">
                  <th className="px-3 py-2">Date / Time</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Urgency</th>
                  <th className="px-3 py-2">Parent</th>
                  <th className="px-3 py-2 hidden lg:table-cell">Phone</th>
                  <th className="px-3 py-2 hidden md:table-cell">Centre</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 hidden lg:table-cell">Assigned</th>
                  <th className="px-3 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <tr key={call.id} className="border-b border-border/50 hover:bg-surface/50 transition-colors">
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                      {formatDateTime(call.calledAt)}
                      {call.callDurationSeconds != null && (
                        <span className="ml-1.5 text-muted">({formatDuration(call.callDurationSeconds)})</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("inline-block px-2 py-0.5 rounded-full text-xs font-medium", CALL_TYPE_COLORS[call.callType] ?? "bg-gray-100 text-gray-700")}>
                        {CALL_TYPE_LABELS[call.callType] ?? call.callType}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("inline-block px-2 py-0.5 rounded-full text-xs font-medium", URGENCY_COLORS[call.urgency] ?? "bg-gray-100")}>
                        {call.urgency}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-foreground">{call.parentName || "—"}</span>
                      {call.childName && <span className="block text-xs text-muted">{call.childName}</span>}
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      {call.parentPhone ? (
                        <a href={`tel:${call.parentPhone}`} className="text-[#004E64] hover:underline">{call.parentPhone}</a>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-xs">{call.centreName || "—"}</td>
                    <td className="px-3 py-2.5">
                      <select
                        value={call.status}
                        onChange={(e) => handleStatusChange(call.id, e.target.value)}
                        className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium border-0 focus:ring-2 focus:ring-brand cursor-pointer",
                          STATUS_COLORS[call.status] ?? "bg-gray-100",
                        )}
                      >
                        <option value="new">New</option>
                        <option value="in_progress">In Progress</option>
                        <option value="actioned">Actioned</option>
                        <option value="closed">Closed</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      <select
                        value={call.assignedTo ?? ""}
                        onChange={(e) => handleAssignChange(call.id, e.target.value)}
                        className="px-1.5 py-0.5 rounded text-xs border-0 focus:ring-2 focus:ring-brand bg-transparent cursor-pointer"
                      >
                        <option value="">Unassigned</option>
                        {TEAM_MEMBERS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => setSelectedCall(call)}
                        className="px-2.5 py-1 text-xs font-medium text-[#004E64] hover:bg-[#004E64]/5 rounded transition-colors"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Detail Panel ──────────────────────────────────── */}
      {selectedCall && (
        <CallDetailPanel
          call={selectedCall}
          onClose={() => setSelectedCall(null)}
          onUpdate={(data) => updateCall.mutate({ id: selectedCall.id, data })}
        />
      )}
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("w-4 h-4", color)} />
        <span className="text-xs text-muted font-medium">{label}</span>
      </div>
      <p className={cn("text-2xl font-bold", color)}>{value}</p>
    </div>
  );
}

function FilterSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ─── Detail Panel ───────────────────────────────────────────

function CallDetailPanel({ call, onClose, onUpdate }: { call: VapiCall; onClose: () => void; onUpdate: (data: Record<string, unknown>) => void }) {
  const [notes, setNotes] = useState(call.notes ?? "");
  const hasCallerInfoInit =
    !!(call.parentName || call.parentPhone || call.parentEmail || call.childName || call.centreName);
  const [transcriptOpen, setTranscriptOpen] = useState(!hasCallerInfoInit);

  useEffect(() => {
    setNotes(call.notes ?? "");
  }, [call.notes]);

  const details = (call.callDetails as Record<string, unknown>) ?? {};
  const hasCallerInfo =
    call.parentName || call.parentPhone || call.parentEmail || call.childName || call.centreName;

  return (
    <Sheet open onOpenChange={() => onClose()} modal={false}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col">
        <div className="px-5 sm:px-6 py-4 border-b border-border flex items-center justify-between gap-4 flex-shrink-0">
          <SheetTitle className="flex items-center gap-2 text-lg font-semibold">
            <Phone className="w-5 h-5 text-[#004E64]" />
            Call Details
          </SheetTitle>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md hover:bg-surface text-muted hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium", CALL_TYPE_COLORS[call.callType])}>
              {CALL_TYPE_LABELS[call.callType] ?? call.callType}
            </span>
            <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium", URGENCY_COLORS[call.urgency])}>
              {call.urgency}
            </span>
            <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium", STATUS_COLORS[call.status])}>
              {call.status.replace("_", " ")}
            </span>
            {call.successEvaluation === true && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Captured
              </span>
            )}
            {call.successEvaluation === false && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Incomplete
              </span>
            )}
          </div>

          {/* Summary */}
          {call.summary && (
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2">Summary</h3>
              <div className="bg-[#004E64]/5 border-l-4 border-[#004E64] rounded-r-lg p-3 text-sm text-foreground/90 leading-relaxed">
                {call.summary}
              </div>
            </section>
          )}

          {/* Enquiry link */}
          {call.linkedEnquiryId && (
            <section>
              <a
                href={`/contact-centre?tab=enquiries&id=${call.linkedEnquiryId}`}
                className="flex items-center justify-between gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">Enquiry auto-created</p>
                    <p className="text-xs text-emerald-700">Parent enrolled in nurture sequence</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-emerald-700" />
              </a>
            </section>
          )}

          {/* Todo link */}
          {call.linkedTodoId && (
            <section>
              <a
                href={`/queue?todo=${call.linkedTodoId}`}
                className="flex items-center justify-between gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900">Todo auto-created for coordinator</p>
                    <p className="text-xs text-blue-700">Booking change ready to action in OWNA</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-blue-700" />
              </a>
            </section>
          )}

          {/* SLA breach badge */}
          {call.slaAlertedAt && call.status !== "actioned" && call.status !== "closed" && (
            <section>
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-900">SLA breach escalated</p>
                  <p className="text-xs text-red-700">
                    Team notified {formatDateTime(call.slaAlertedAt)} — action this call now.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Caller Details */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <User className="w-4 h-4" /> Caller Details
            </h3>
            {hasCallerInfo ? (
              <div className="bg-surface rounded-lg p-3 space-y-1.5 text-sm">
                {call.parentName && <Row label="Name" value={call.parentName} />}
                {call.parentPhone && (
                  <Row label="Phone" value={<a href={`tel:${call.parentPhone}`} className="text-[#004E64] hover:underline">{call.parentPhone}</a>} />
                )}
                {call.parentEmail && (
                  <Row label="Email" value={<a href={`mailto:${call.parentEmail}`} className="text-[#004E64] hover:underline">{call.parentEmail}</a>} />
                )}
                {call.childName && <Row label="Child" value={call.childName} />}
                {call.centreName && <Row label="Centre" value={call.centreName} />}
                {call.callDurationSeconds != null && <Row label="Duration" value={formatDuration(call.callDurationSeconds)} />}
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
                <p className="font-medium mb-1">No structured data captured</p>
                <p className="text-amber-800">
                  The VAPI assistant didn&apos;t emit a structured marker (e.g. <code className="bg-amber-100 px-1 rounded">ENQUIRY_CAPTURED:&#123;...&#125;</code>) for this call. Review the transcript below to extract details manually, or check the assistant&apos;s system prompt to ensure it outputs markers at the end of each pathway.
                </p>
                {call.callDurationSeconds != null && (
                  <p className="mt-2 text-amber-700">Duration: {formatDuration(call.callDurationSeconds)}</p>
                )}
              </div>
            )}
          </section>

          {/* Call Details JSON */}
          {Object.keys(details).length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-2">Call Details</h3>
              <div className="bg-surface rounded-lg p-3 space-y-1 text-sm">
                {Object.entries(details)
                  .filter(([, v]) => v != null && v !== "")
                  .map(([k, v]) => (
                    <Row key={k} label={humaniseKey(k)} value={String(v)} />
                  ))}
              </div>
            </section>
          )}

          {/* Transcript */}
          {call.transcript && (
            <section>
              <button
                onClick={() => setTranscriptOpen(!transcriptOpen)}
                className="flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-[#004E64] transition-colors"
              >
                {transcriptOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Transcript
              </button>
              {transcriptOpen && (
                <pre className="mt-2 bg-surface rounded-lg p-3 text-xs text-foreground/80 whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
                  {call.transcript}
                </pre>
              )}
            </section>
          )}

          {/* Recording */}
          {call.recordingUrl && (
            <a
              href={call.recordingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-[#004E64]/5 text-[#004E64] rounded-lg hover:bg-[#004E64]/10 transition-colors text-sm font-medium"
            >
              <Play className="w-4 h-4" /> Play Recording
            </a>
          )}

          {/* Notes */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2">Notes</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (call.notes ?? "")) {
                  onUpdate({ notes });
                }
              }}
              placeholder="Add notes about this call..."
              className="w-full p-3 border border-border rounded-lg text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </section>

          {/* Status Controls */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2">Update Status</h3>
            <div className="flex gap-2">
              <select
                value={call.status}
                onChange={(e) => onUpdate({ status: e.target.value })}
                className="flex-1 px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="new">New</option>
                <option value="in_progress">In Progress</option>
                <option value="actioned">Actioned</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </section>

          {/* Timeline */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-2">Timeline</h3>
            <div className="space-y-2 text-xs">
              <TimelineItem
                icon={Phone}
                label="Called at"
                time={formatDateTime(call.calledAt)}
                ok
              />
              <TimelineItem
                icon={Mail}
                label="Parent email sent"
                time={call.followUpEmailSent ? "Sent" : "Not sent"}
                ok={call.followUpEmailSent}
              />
              <TimelineItem
                icon={Bell}
                label="Internal notification"
                time={call.internalNotificationSent ? "Sent" : "Not sent"}
                ok={call.internalNotificationSent}
              />
              {call.actionedAt && (
                <TimelineItem
                  icon={CheckCircle}
                  label={`Actioned by ${call.actionedBy ?? "—"}`}
                  time={formatDateTime(call.actionedAt)}
                  ok
                />
              )}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted w-20 flex-shrink-0">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function TimelineItem({ icon: Icon, label, time, ok }: { icon: React.ComponentType<{ className?: string }>; label: string; time: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("w-3.5 h-3.5", ok ? "text-emerald-500" : "text-muted")} />
      <span className="text-muted">{label}</span>
      <span className={cn("ml-auto font-medium", ok ? "text-emerald-600" : "text-muted")}>{ok ? "✓" : "✗"} {time}</span>
    </div>
  );
}

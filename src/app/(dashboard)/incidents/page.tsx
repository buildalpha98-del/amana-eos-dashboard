"use client";

import { useState, useMemo } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Plus,
  TrendingUp,
  TrendingDown,
  Minus,
  Flag,
  Clock,
  ShieldAlert,
  Sparkles,
  Loader2 as SeedLoader,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useServices } from "@/hooks/useServices";
import {
  useIncidents,
  useIncidentSummary,
  useIncidentTrends,
  useCreateIncident,
  type IncidentFilters,
  type IncidentRecord,
} from "@/hooks/useIncidents";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INCIDENT_TYPES = [
  { value: "injury", label: "Injury" },
  { value: "illness", label: "Illness" },
  { value: "behaviour", label: "Behaviour" },
  { value: "missing_child", label: "Missing Child" },
  { value: "near_miss", label: "Near Miss" },
  { value: "medication_error", label: "Medication Error" },
  { value: "property_damage", label: "Property Damage" },
  { value: "complaint", label: "Complaint" },
];

const SEVERITY_LEVELS = [
  { value: "minor", label: "Minor", color: "bg-gray-100 text-gray-700" },
  { value: "moderate", label: "Moderate", color: "bg-yellow-100 text-yellow-700" },
  { value: "reportable", label: "Reportable", color: "bg-orange-100 text-orange-700" },
  { value: "serious", label: "Serious", color: "bg-red-100 text-red-700" },
];

const LOCATIONS = [
  { value: "indoor", label: "Indoor" },
  { value: "outdoor", label: "Outdoor" },
  { value: "playground", label: "Playground" },
  { value: "transition", label: "Transition" },
  { value: "bathroom", label: "Bathroom" },
  { value: "kitchen", label: "Kitchen" },
];

const TIMES_OF_DAY = [
  { value: "arrival", label: "Arrival" },
  { value: "programme", label: "Programme" },
  { value: "meal_time", label: "Meal Time" },
  { value: "packdown", label: "Packdown" },
  { value: "departure", label: "Departure" },
];

const TYPE_COLORS: Record<string, string> = {
  injury: "bg-red-50 text-red-700",
  illness: "bg-purple-50 text-purple-700",
  behaviour: "bg-blue-50 text-blue-700",
  missing_child: "bg-rose-50 text-rose-700",
  near_miss: "bg-amber-50 text-amber-700",
  medication_error: "bg-orange-50 text-orange-700",
  property_damage: "bg-gray-100 text-gray-700",
  complaint: "bg-cyan-50 text-cyan-700",
};

const SEVERITY_BADGE: Record<string, string> = {
  minor: "bg-gray-100 text-gray-700",
  moderate: "bg-yellow-100 text-yellow-700",
  reportable: "bg-orange-100 text-orange-700",
  serious: "bg-red-100 text-red-700",
};

function formatLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAuDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IncidentsPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<"overview" | "trends">("overview");
  const [showCreate, setShowCreate] = useState(false);
  const [seedingProtocols, setSeedingProtocols] = useState(false);

  // Filters
  const [filterService, setFilterService] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const filters: IncidentFilters = useMemo(
    () => ({
      ...(filterService && { serviceId: filterService }),
      ...(filterType && { type: filterType }),
      ...(filterSeverity && { severity: filterSeverity }),
      ...(filterFrom && { from: filterFrom }),
      ...(filterTo && { to: filterTo }),
    }),
    [filterService, filterType, filterSeverity, filterFrom, filterTo],
  );

  const { data: summary, isLoading: summaryLoading } = useIncidentSummary(filters);
  const { data: trends } = useIncidentTrends(8);

  // Week-on-week from trends
  const wow = trends?.weekOnWeek;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-brand" />
            Incidents
          </h1>
          <p className="text-sm text-foreground/50 mt-1">
            Track and analyse safety incidents across services
          </p>
        </div>
        <div className="flex items-center gap-2">
          {session?.user?.role === "owner" && (
            <button
              onClick={async () => {
                setSeedingProtocols(true);
                try {
                  const res = await fetch("/api/incidents/seed", { method: "POST" });
                  const data = await res.json();
                  toast({ description: data.message || "Protocols seeded!" });
                } catch {
                  toast({ description: "Failed to seed protocols", variant: "destructive" });
                } finally {
                  setSeedingProtocols(false);
                }
              }}
              disabled={seedingProtocols}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-amber-300 bg-amber-50 text-amber-700 text-sm font-medium rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              {seedingProtocols ? <SeedLoader className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span className="hidden sm:inline">Seed Protocols</span>
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            Report Incident
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summaryLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-background border border-border rounded-xl p-4">
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-7 w-12" />
            </div>
          ))
        ) : (
          <>
            <StatCard
              label="Total Incidents"
              value={summary?.total ?? 0}
              icon={AlertTriangle}
              color="text-brand"
            />
            <StatCard
              label="Reportable"
              value={summary?.reportable ?? 0}
              icon={ShieldAlert}
              color={(summary?.reportable ?? 0) > 0 ? "text-red-600" : "text-green-600"}
            />
            <StatCard
              label="Follow-up Pending"
              value={summary?.followUpPending ?? 0}
              icon={Clock}
              color={(summary?.followUpPending ?? 0) > 0 ? "text-amber-600" : "text-green-600"}
            />
            <WowCard wow={wow} />
          </>
        )}
      </div>

      {/* Tab pills */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 w-fit">
        {(["overview", "trends"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === t
                ? "bg-background text-foreground shadow-sm"
                : "text-foreground/50 hover:text-foreground"
            }`}
          >
            {t === "overview" ? "Overview" : "Trends"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" ? (
        <OverviewTab
          filters={filters}
          filterService={filterService}
          setFilterService={setFilterService}
          filterType={filterType}
          setFilterType={setFilterType}
          filterSeverity={filterSeverity}
          setFilterSeverity={setFilterSeverity}
          filterFrom={filterFrom}
          setFilterFrom={setFilterFrom}
          filterTo={filterTo}
          setFilterTo={setFilterTo}
        />
      ) : (
        <TrendsTab />
      )}

      {/* Create modal */}
      {showCreate && <CreateIncidentModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Cards
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="bg-background border border-border rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-foreground/30" />
        <p className="text-xs text-foreground/50">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function WowCard({ wow }: { wow?: { change: number; trend: string } | null }) {
  const change = wow?.change ?? 0;
  const trend = wow?.trend ?? "insufficient_data";
  const isRising = trend === "rising";
  const isFalling = trend === "falling";

  return (
    <div className="bg-background border border-border rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <Flag className="h-3.5 w-3.5 text-foreground/30" />
        <p className="text-xs text-foreground/50">Week-on-Week</p>
      </div>
      <div className="flex items-center gap-2">
        <p className={`text-2xl font-bold ${isRising ? "text-red-600" : isFalling ? "text-green-600" : "text-foreground"}`}>
          {change > 0 ? `+${change}` : change}
        </p>
        {isRising && <TrendingUp className="h-5 w-5 text-red-500" />}
        {isFalling && <TrendingDown className="h-5 w-5 text-green-500" />}
        {!isRising && !isFalling && <Minus className="h-5 w-5 text-foreground/30" />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab({
  filters,
  filterService,
  setFilterService,
  filterType,
  setFilterType,
  filterSeverity,
  setFilterSeverity,
  filterFrom,
  setFilterFrom,
  filterTo,
  setFilterTo,
}: {
  filters: IncidentFilters;
  filterService: string;
  setFilterService: (v: string) => void;
  filterType: string;
  setFilterType: (v: string) => void;
  filterSeverity: string;
  setFilterSeverity: (v: string) => void;
  filterFrom: string;
  setFilterFrom: (v: string) => void;
  filterTo: string;
  setFilterTo: (v: string) => void;
}) {
  const { data: servicesList } = useServices();
  const { data, isLoading } = useIncidents(filters);
  const incidents = data?.incidents ?? [];

  const selectClass =
    "px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30";
  const inputClass =
    "px-3 py-1.5 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30";

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={filterService} onChange={(e) => setFilterService(e.target.value)} className={selectClass}>
          <option value="">All Services</option>
          {servicesList?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={selectClass}>
          <option value="">All Types</option>
          {INCIDENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} className={selectClass}>
          <option value="">All Severities</option>
          {SEVERITY_LEVELS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
          className={inputClass}
          placeholder="From"
        />
        <input
          type="date"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
          className={inputClass}
          placeholder="To"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-16 text-foreground/40">
          <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No incidents found</p>
          <p className="text-sm mt-1">Adjust your filters or report a new incident</p>
        </div>
      ) : (
        <div className="bg-background border border-border rounded-xl overflow-hidden">
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface/50">
                  <th className="text-left px-4 py-3 font-medium text-foreground/60 w-8" />
                  <th className="text-left px-4 py-3 font-medium text-foreground/60">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-foreground/60">Service</th>
                  <th className="text-left px-4 py-3 font-medium text-foreground/60">Child</th>
                  <th className="text-left px-4 py-3 font-medium text-foreground/60">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-foreground/60">Severity</th>
                  <th className="text-left px-4 py-3 font-medium text-foreground/60">Notified</th>
                  <th className="text-left px-4 py-3 font-medium text-foreground/60">Reportable</th>
                  <th className="text-left px-4 py-3 font-medium text-foreground/60">Follow-up</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((inc) => (
                  <IncidentRow key={inc.id} incident={inc} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-border">
            {incidents.map((inc) => (
              <IncidentCard key={inc.id} incident={inc} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Incident Row (desktop)
// ---------------------------------------------------------------------------

function IncidentRow({ incident }: { incident: IncidentRecord }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className="border-b border-border hover:bg-surface/30 cursor-pointer transition-colors"
      >
        <td className="px-4 py-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-foreground/40" />
          ) : (
            <ChevronRight className="h-4 w-4 text-foreground/40" />
          )}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">{formatAuDate(incident.incidentDate)}</td>
        <td className="px-4 py-3">{incident.service.name}</td>
        <td className="px-4 py-3">{incident.childName || <span className="text-foreground/30">-</span>}</td>
        <td className="px-4 py-3">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[incident.incidentType] || "bg-gray-100 text-gray-700"}`}>
            {formatLabel(incident.incidentType)}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_BADGE[incident.severity] || "bg-gray-100 text-gray-700"}`}>
            {formatLabel(incident.severity)}
          </span>
        </td>
        <td className="px-4 py-3">
          {incident.parentNotified ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <X className="h-4 w-4 text-foreground/20" />
          )}
        </td>
        <td className="px-4 py-3">
          {incident.reportableToAuthority ? (
            <ShieldAlert className="h-4 w-4 text-red-500" />
          ) : (
            <span className="text-foreground/20">-</span>
          )}
        </td>
        <td className="px-4 py-3">
          {incident.followUpRequired ? (
            incident.followUpCompleted ? (
              <span className="text-xs text-green-600 font-medium">Done</span>
            ) : (
              <span className="text-xs text-amber-600 font-medium">Pending</span>
            )
          ) : (
            <span className="text-foreground/20">-</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-surface/20">
          <td colSpan={9} className="px-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-foreground/60 mb-1">Description</p>
                <p className="text-foreground whitespace-pre-wrap">{incident.description}</p>
              </div>
              {incident.actionTaken && (
                <div>
                  <p className="font-medium text-foreground/60 mb-1">Action Taken</p>
                  <p className="text-foreground whitespace-pre-wrap">{incident.actionTaken}</p>
                </div>
              )}
              <div className="flex gap-6 text-xs text-foreground/50">
                {incident.location && <span>Location: {formatLabel(incident.location)}</span>}
                {incident.timeOfDay && <span>Time: {formatLabel(incident.timeOfDay)}</span>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Incident Card (mobile)
// ---------------------------------------------------------------------------

function IncidentCard({ incident }: { incident: IncidentRecord }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="p-4" onClick={() => setExpanded(!expanded)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[incident.incidentType] || "bg-gray-100 text-gray-700"}`}>
              {formatLabel(incident.incidentType)}
            </span>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_BADGE[incident.severity] || "bg-gray-100 text-gray-700"}`}>
              {formatLabel(incident.severity)}
            </span>
          </div>
          <p className="text-sm font-medium text-foreground mt-1">{incident.service.name}</p>
          <p className="text-xs text-foreground/50">
            {formatAuDate(incident.incidentDate)}
            {incident.childName ? ` \u00B7 ${incident.childName}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {incident.reportableToAuthority && <ShieldAlert className="h-4 w-4 text-red-500" />}
          {incident.followUpRequired && !incident.followUpCompleted && (
            <Clock className="h-4 w-4 text-amber-500" />
          )}
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-foreground/30" />
          ) : (
            <ChevronRight className="h-4 w-4 text-foreground/30" />
          )}
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-2 text-sm">
          <div>
            <p className="font-medium text-foreground/60 text-xs">Description</p>
            <p className="text-foreground whitespace-pre-wrap">{incident.description}</p>
          </div>
          {incident.actionTaken && (
            <div>
              <p className="font-medium text-foreground/60 text-xs">Action Taken</p>
              <p className="text-foreground whitespace-pre-wrap">{incident.actionTaken}</p>
            </div>
          )}
          <div className="flex gap-4 text-xs text-foreground/50">
            {incident.parentNotified && <span>Parent notified</span>}
            {incident.location && <span>{formatLabel(incident.location)}</span>}
            {incident.timeOfDay && <span>{formatLabel(incident.timeOfDay)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trends Tab
// ---------------------------------------------------------------------------

function TrendsTab() {
  const { data: trends, isLoading } = useIncidentTrends(8);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!trends) {
    return (
      <div className="text-center py-16 text-foreground/40">
        <p>No trend data available</p>
      </div>
    );
  }

  const maxWeekly = Math.max(...trends.weeklyTrend.map((w) => w.total), 1);

  return (
    <div className="space-y-6">
      {/* Weekly Trend Bar Chart */}
      <div className="bg-background border border-border rounded-xl p-6">
        <h3 className="text-sm font-medium text-foreground/60 mb-4">Weekly Incidents (last 8 weeks)</h3>
        <div className="flex items-end gap-2 h-40">
          {trends.weeklyTrend.map((w) => {
            const height = (w.total / maxWeekly) * 100;
            const weekLabel = new Date(w.week).toLocaleDateString("en-AU", {
              day: "2-digit",
              month: "short",
            });
            return (
              <div key={w.week} className="flex-1 flex flex-col items-center gap-1 group">
                <span className="text-xs font-medium text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  {w.total}
                </span>
                <div
                  className="w-full bg-brand/80 rounded-t-md hover:bg-brand transition-colors min-h-[4px]"
                  style={{ height: `${Math.max(height, 3)}%` }}
                  title={`${weekLabel}: ${w.total} incidents`}
                />
                <span className="text-[10px] text-foreground/40 whitespace-nowrap">{weekLabel}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Flagged Centres */}
      {trends.flaggedCentres.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground/60 mb-3">Flagged Centres</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {trends.flaggedCentres.map((fc) => (
              <div
                key={fc.centre}
                className="bg-red-50 border border-red-200 rounded-xl p-4"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Flag className="h-4 w-4 text-red-500" />
                  <p className="font-medium text-red-900 text-sm">{fc.centre}</p>
                </div>
                <p className="text-xs text-red-700">{fc.reason}</p>
                <div className="flex gap-4 mt-2 text-xs text-red-600">
                  <span>This week: {fc.count}</span>
                  <span>Avg: {fc.average}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Distribution Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DistributionCard title="By Type" data={trends.byType} total={trends.totalIncidents} />
        <DistributionCard title="By Severity" data={trends.bySeverity} total={trends.totalIncidents} colorMap={SEVERITY_BADGE} />
        <DistributionCard title="By Location" data={trends.byLocation} total={trends.totalIncidents} />
        <DistributionCard title="By Time of Day" data={trends.byTimeOfDay} total={trends.totalIncidents} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Distribution Card
// ---------------------------------------------------------------------------

const BAR_COLORS = [
  "bg-brand",
  "bg-blue-500",
  "bg-purple-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
];

function DistributionCard({
  title,
  data,
  total,
  colorMap,
}: {
  title: string;
  data: Record<string, number>;
  total: number;
  colorMap?: Record<string, string>;
}) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);

  if (entries.length === 0) {
    return (
      <div className="bg-background border border-border rounded-xl p-4">
        <h4 className="text-sm font-medium text-foreground/60 mb-3">{title}</h4>
        <p className="text-xs text-foreground/30">No data</p>
      </div>
    );
  }

  return (
    <div className="bg-background border border-border rounded-xl p-4">
      <h4 className="text-sm font-medium text-foreground/60 mb-3">{title}</h4>
      <div className="space-y-2">
        {entries.map(([key, count], idx) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={key}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-foreground">{formatLabel(key)}</span>
                <span className="text-foreground/50">
                  {count} ({pct}%)
                </span>
              </div>
              <div className="h-2 bg-surface rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${BAR_COLORS[idx % BAR_COLORS.length]}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Incident Modal
// ---------------------------------------------------------------------------

function CreateIncidentModal({ onClose }: { onClose: () => void }) {
  const { data: servicesList } = useServices();
  const createMutation = useCreateIncident();

  const [form, setForm] = useState({
    serviceId: "",
    incidentDate: new Date().toISOString().split("T")[0],
    childName: "",
    incidentType: "",
    severity: "",
    location: "",
    timeOfDay: "",
    description: "",
    actionTaken: "",
    parentNotified: false,
    reportableToAuthority: false,
    followUpRequired: false,
  });

  const update = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const canSubmit =
    form.serviceId && form.incidentDate && form.incidentType && form.severity && form.description;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      await createMutation.mutateAsync({
        serviceId: form.serviceId,
        incidentDate: form.incidentDate,
        childName: form.childName || undefined,
        incidentType: form.incidentType,
        severity: form.severity,
        location: form.location || undefined,
        timeOfDay: form.timeOfDay || undefined,
        description: form.description,
        actionTaken: form.actionTaken || undefined,
        parentNotified: form.parentNotified,
        reportableToAuthority: form.reportableToAuthority,
        followUpRequired: form.followUpRequired,
      });
      toast({ description: "Incident reported successfully" });
      onClose();
    } catch (err) {
      toast({
        description: err instanceof Error ? err.message : "Failed to report incident",
        variant: "destructive",
      });
    }
  }

  const labelClass = "block text-sm font-medium text-foreground/70 mb-1";
  const inputClass =
    "w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-background border border-border rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-semibold text-foreground">Report Incident</h2>
          <button onClick={onClose} className="text-foreground/40 hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Service */}
          <div>
            <label className={labelClass}>
              Service <span className="text-red-500">*</span>
            </label>
            <select
              value={form.serviceId}
              onChange={(e) => update("serviceId", e.target.value)}
              className={inputClass}
              required
            >
              <option value="">Select service...</option>
              {servicesList?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date + Child */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.incidentDate}
                onChange={(e) => update("incidentDate", e.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass}>Child Name</label>
              <input
                type="text"
                value={form.childName}
                onChange={(e) => update("childName", e.target.value)}
                className={inputClass}
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Type + Severity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                Type <span className="text-red-500">*</span>
              </label>
              <select
                value={form.incidentType}
                onChange={(e) => update("incidentType", e.target.value)}
                className={inputClass}
                required
              >
                <option value="">Select type...</option>
                {INCIDENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>
                Severity <span className="text-red-500">*</span>
              </label>
              <select
                value={form.severity}
                onChange={(e) => update("severity", e.target.value)}
                className={inputClass}
                required
              >
                <option value="">Select severity...</option>
                {SEVERITY_LEVELS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Location + Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Location</label>
              <select
                value={form.location}
                onChange={(e) => update("location", e.target.value)}
                className={inputClass}
              >
                <option value="">Select...</option>
                {LOCATIONS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Time of Day</label>
              <select
                value={form.timeOfDay}
                onChange={(e) => update("timeOfDay", e.target.value)}
                className={inputClass}
              >
                <option value="">Select...</option>
                {TIMES_OF_DAY.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              className={inputClass}
              rows={3}
              required
              placeholder="Describe what happened..."
            />
          </div>

          {/* Action Taken */}
          <div>
            <label className={labelClass}>Action Taken</label>
            <textarea
              value={form.actionTaken}
              onChange={(e) => update("actionTaken", e.target.value)}
              className={inputClass}
              rows={2}
              placeholder="What was done in response..."
            />
          </div>

          {/* Checkboxes */}
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.parentNotified}
                onChange={(e) => update("parentNotified", e.target.checked)}
                className="rounded border-border"
              />
              Parent Notified
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.reportableToAuthority}
                onChange={(e) => update("reportableToAuthority", e.target.checked)}
                className="rounded border-border"
              />
              Reportable to Authority
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.followUpRequired}
                onChange={(e) => update("followUpRequired", e.target.checked)}
                className="rounded border-border"
              />
              Follow-up Required
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-foreground/60 hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || createMutation.isPending}
              className="px-4 py-2 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? "Saving..." : "Report Incident"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

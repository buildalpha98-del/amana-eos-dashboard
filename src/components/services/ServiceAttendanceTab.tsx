"use client";

import { Fragment, useState, useMemo, useCallback, useEffect } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Users,
  TrendingUp,
  Calendar,
  Save,
  Loader2,
  BarChart3,
  Info,
  FileSpreadsheet,
  AlertTriangle,
  CopyPlus,
  Sparkles,
  X,
  ChevronDown,
  ChevronUp,
  Printer,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ImportWizard, type ColumnConfig } from "@/components/import/ImportWizard";
import {
  useAttendance,
  useAttendanceSummary,
  useBatchUpdateAttendance,
  useCreateAttendance,
  type AttendanceInput,
} from "@/hooks/useAttendance";
import { useService } from "@/hooks/useServices";
import {
  SESSION_LABELS,
  SESSION_ORDER,
  BOOKING_TYPE_LABELS,
} from "@/lib/session-labels";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { AiButton } from "@/components/ui/AiButton";
import { BookingInput } from "@/components/services/attendance/BookingInput";
import type { SessionType } from "@prisma/client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface Props {
  serviceId: string;
  serviceName?: string;
}

const attendanceImportColumns: ColumnConfig[] = [
  { key: "centre", label: "Centre / Code", required: true },
  { key: "date", label: "Date", required: true },
  { key: "sessionType", label: "Session Type (BSC/ASC/VC)", required: true },
  { key: "enrolled", label: "Permanent", required: true },
  { key: "attended", label: "Casual Bookings", required: true },
  { key: "casual", label: "Casual" },
  { key: "absent", label: "Absent" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

function getWeekDates(weekOffset: number): Date[] {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);

  return DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString("en-AU", { weekday: "short" });
}

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

/**
 * Remember the Holiday Quest toggle state per centre so coordinators don't
 * have to re-enable it every time during holiday weeks.
 */
function readLocalBool(key: string, defaultValue: boolean): boolean {
  if (typeof window === "undefined") return defaultValue;
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? defaultValue : stored === "true";
  } catch {
    return defaultValue;
  }
}

function useLocalBoolPref(key: string, defaultValue: boolean) {
  const [value, setValue] = useState<boolean>(() => readLocalBool(key, defaultValue));
  const update = useCallback(
    (v: boolean) => {
      setValue(v);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(key, String(v));
      } catch {
        /* localStorage unavailable — state remains in-memory only */
      }
    },
    [key]
  );
  return [value, update] as const;
}

type CellValues = { permanent: number; casual: number };

function buildCellKey(dateStr: string, session: SessionType): string {
  return `${dateStr}|${session}`;
}

/** Print-optimised HTML for the flipped attendance grid. */
function printAttendance(
  sessions: SessionType[],
  cells: Record<string, CellValues>,
  weekDates: Date[],
  capacity: number | null,
  serviceName?: string
) {
  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const weekStart = weekDates[0].toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const headerCells = weekDates
    .map(
      (d) =>
        `<th>${formatDayLabel(d)} ${formatDateLabel(d)}</th>`
    )
    .join("");

  const sessionRows = sessions
    .map((session) => {
      const permRow = weekDates
        .map((d) => {
          const v = cells[buildCellKey(formatDate(d), session)];
          return `<td>${v?.permanent ?? 0}</td>`;
        })
        .join("");
      const casualRow = weekDates
        .map((d) => {
          const v = cells[buildCellKey(formatDate(d), session)];
          return `<td>${v?.casual ?? 0}</td>`;
        })
        .join("");
      return `
        <tr class="session-header"><td colspan="6">${SESSION_LABELS[session]}</td></tr>
        <tr><td class="sub">${BOOKING_TYPE_LABELS.permanent}</td>${permRow}</tr>
        <tr><td class="sub">${BOOKING_TYPE_LABELS.casual}</td>${casualRow}</tr>
      `;
    })
    .join("");

  const totalsRow = weekDates
    .map((d) => {
      let t = 0;
      for (const s of sessions) {
        const v = cells[buildCellKey(formatDate(d), s)];
        t += (v?.permanent ?? 0) + (v?.casual ?? 0);
      }
      return `<td>${t}</td>`;
    })
    .join("");
  const capacityRow = weekDates
    .map(() => `<td>${capacity ?? "—"}</td>`)
    .join("");

  const container = document.createElement("div");
  container.id = "print-attendance-container";
  container.className = "print-only";
  container.innerHTML = `
    <div class="print-header">
      <div class="print-header-brand">Amana OSHC</div>
      <div class="print-header-subtitle">${serviceName || "Centre"} &mdash; Weekly Attendance</div>
      <div class="print-header-date">Week starting ${weekStart} &bull; Printed ${today}</div>
    </div>
    <table class="print-attendance-table">
      <thead>
        <tr><th style="text-align: left;">Session</th>${headerCells}</tr>
      </thead>
      <tbody>${sessionRows}</tbody>
      <tfoot>
        <tr class="totals"><td class="sub">Total bookings</td>${totalsRow}</tr>
        <tr class="capacity"><td class="sub">Approved places</td>${capacityRow}</tr>
      </tfoot>
    </table>
    <div class="print-footer print-only">Amana OSHC - ${serviceName || "Centre"} - Printed ${today}</div>
  `;

  document.body.appendChild(container);
  window.print();
  setTimeout(() => {
    document.body.removeChild(container);
  }, 1000);
}

export function ServiceAttendanceTab({ serviceId, serviceName }: Props) {
  const queryClient = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [showHolidayQuest, setShowHolidayQuest] = useLocalBoolPref(
    `attendance-show-holiday-quest:${serviceId}`,
    false
  );
  const [showImportAttendance, setShowImportAttendance] = useState(false);
  const [showPropagateConfirm, setShowPropagateConfirm] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const from = formatDate(weekDates[0]);
  const to = formatDate(weekDates[4]);

  // 13-week trend data
  const thirteenWeeksAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 91);
    return formatDate(d);
  }, []);

  const { data: service } = useService(serviceId);
  const approvedPlaces = service?.capacity ?? null;

  const { data: records, isLoading: loadingRecords } = useAttendance({
    serviceId,
    from,
    to,
  });

  const { data: summaryData, isLoading: loadingSummary } =
    useAttendanceSummary({
      serviceId,
      from: thirteenWeeksAgo,
      period: "weekly",
    });

  const batchUpdate = useBatchUpdateAttendance();
  const singleUpsert = useCreateAttendance();

  const propagateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/attendance/propagate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, weeksAhead: 8 }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to propagate");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        description: `Permanent counts propagated to future weeks (${data.propagated} records)`,
      });
      queryClient.invalidateQueries({ queryKey: ["budget-summary", serviceId] });
    },
    onError: () => {
      toast({ description: "Failed to propagate permanent counts" });
    },
  });

  const handlePropagate = () => setShowPropagateConfirm(true);

  // Attendance anomalies
  const { data: anomalies } = useQuery({
    queryKey: ["attendance-anomalies", serviceId],
    queryFn: async () => {
      const res = await fetch(
        `/api/attendance/anomalies?serviceId=${serviceId}&dismissed=false`
      );
      if (!res.ok) return [];
      return res.json();
    },
  });

  const handleDismissAnomaly = async (anomalyId: string) => {
    await fetch(`/api/attendance/anomalies/${anomalyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dismissed: true }),
    });
    queryClient.invalidateQueries({
      queryKey: ["attendance-anomalies", serviceId],
    });
  };

  // Demand forecast state
  const [forecast, setForecast] = useState<string | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastExpanded, setForecastExpanded] = useState(true);

  // Roster suggestions state
  const [rosterSuggestion, setRosterSuggestion] = useState<string | null>(null);
  const [rosterExpanded, setRosterExpanded] = useState(true);

  const handleForecast = async () => {
    setForecastLoading(true);
    try {
      const res = await fetch(`/api/services/${serviceId}/demand-forecast`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate forecast");
      }
      const data = await res.json();
      setForecast(data.forecast);
      setForecastExpanded(true);
    } catch (err) {
      toast({
        description:
          err instanceof Error ? err.message : "Failed to generate forecast",
        variant: "destructive",
      });
    } finally {
      setForecastLoading(false);
    }
  };

  const visibleSessions = useMemo<SessionType[]>(
    () =>
      showHolidayQuest
        ? SESSION_ORDER
        : SESSION_ORDER.filter((s) => s !== "vc"),
    [showHolidayQuest]
  );

  // Build the cell map from server data + any unsaved edits
  const [pendingEdits, setPendingEdits] = useState<Record<string, CellValues>>(
    {}
  );

  const cells = useMemo<Record<string, CellValues>>(() => {
    const out: Record<string, CellValues> = {};
    for (const date of weekDates) {
      const dateStr = formatDate(date);
      for (const session of SESSION_ORDER) {
        const key = buildCellKey(dateStr, session);
        if (pendingEdits[key]) {
          out[key] = pendingEdits[key];
          continue;
        }
        const rec = records?.find(
          (r) => r.date.startsWith(dateStr) && r.sessionType === session
        );
        out[key] = {
          permanent: rec?.enrolled ?? 0,
          casual: rec?.attended ?? 0,
        };
      }
    }
    return out;
  }, [weekDates, records, pendingEdits]);

  // Reset saved-indicator back to idle after a moment
  useEffect(() => {
    if (saveState !== "saved") return;
    const t = setTimeout(() => setSaveState("idle"), 1500);
    return () => clearTimeout(t);
  }, [saveState]);

  const findExistingRecord = useCallback(
    (dateStr: string, session: SessionType) => {
      return records?.find(
        (r) => r.date.startsWith(dateStr) && r.sessionType === session
      );
    },
    [records]
  );

  /** Commit a single cell edit: optimistic UI + POST upsert. */
  const handleCellCommit = useCallback(
    (
      date: Date,
      session: SessionType,
      field: "permanent" | "casual",
      next: number
    ) => {
      const dateStr = formatDate(date);
      const key = buildCellKey(dateStr, session);
      const existing = findExistingRecord(dateStr, session);
      const current: CellValues = cells[key] ?? { permanent: 0, casual: 0 };
      const updated: CellValues = { ...current, [field]: next };

      setPendingEdits((prev) => ({ ...prev, [key]: updated }));
      setSaveState("saving");

      const payload: AttendanceInput = {
        serviceId,
        date: dateStr,
        sessionType: session,
        enrolled: updated.permanent,
        attended: updated.casual,
        capacity: existing?.capacity ?? 0,
        casual: existing?.casual ?? 0,
        absent: existing?.absent ?? 0,
      };

      singleUpsert.mutate(payload, {
        onSuccess: () => {
          // Clear the pending edit so the authoritative server value wins
          // after the list query refetches.
          setPendingEdits((prev) => {
            const { [key]: _ignored, ...rest } = prev;
            return rest;
          });
          setSaveState("saved");
        },
        onError: () => {
          setSaveState("error");
        },
      });
    },
    [cells, findExistingRecord, serviceId, singleUpsert]
  );

  /** Save Week: batch upsert every visible cell as a safety net. */
  const handleSave = async () => {
    const inputs: AttendanceInput[] = [];
    for (const date of weekDates) {
      const dateStr = formatDate(date);
      for (const session of visibleSessions) {
        const key = buildCellKey(dateStr, session);
        const v = cells[key] ?? { permanent: 0, casual: 0 };
        const existing = findExistingRecord(dateStr, session);
        inputs.push({
          serviceId,
          date: dateStr,
          sessionType: session,
          enrolled: v.permanent,
          attended: v.casual,
          capacity: existing?.capacity ?? 0,
          casual: existing?.casual ?? 0,
          absent: existing?.absent ?? 0,
        });
      }
    }
    setSaveState("saving");
    try {
      await batchUpdate.mutateAsync(inputs);
      setPendingEdits({});
      setSaveState("saved");
      toast({ description: "Week saved" });
    } catch {
      setSaveState("error");
    }
  };

  const dayTotals = useMemo(() => {
    return weekDates.map((date) => {
      const dateStr = formatDate(date);
      let total = 0;
      for (const session of visibleSessions) {
        const v = cells[buildCellKey(dateStr, session)];
        total += (v?.permanent ?? 0) + (v?.casual ?? 0);
      }
      return total;
    });
  }, [weekDates, visibleSessions, cells]);

  // Trend chart data from summary
  const chartData = useMemo(() => {
    if (!summaryData?.summary) return [];
    return summaryData.summary.map((b) => ({
      period: b.period,
      "BSC %": b.bsc.occupancyRate,
      "ASC %": b.asc.occupancyRate,
    }));
  }, [summaryData]);

  const totals = summaryData?.totals;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          size="sm"
          title="BSC Occupancy"
          value={totals ? `${totals.bscOccupancy}%` : "—"}
          icon={Users}
          iconColor="#3B82F6"
          loading={loadingSummary}
        />
        <StatCard
          size="sm"
          title="ASC Occupancy"
          value={totals ? `${totals.ascOccupancy}%` : "—"}
          icon={Users}
          iconColor="#8B5CF6"
          loading={loadingSummary}
        />
        <StatCard
          size="sm"
          title="Total Permanent"
          value={totals ? `${totals.totalEnrolled}` : "—"}
          icon={TrendingUp}
          iconColor="#10B981"
          loading={loadingSummary}
        />
        <StatCard
          size="sm"
          title="Overall Occupancy"
          value={totals ? `${totals.overallOccupancy}%` : "—"}
          icon={BarChart3}
          iconColor="#004E64"
          loading={loadingSummary}
        />
      </div>

      {/* Attendance Anomaly Alerts */}
      {anomalies && anomalies.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">
              Attendance Anomalies Detected
            </span>
          </div>
          <div className="space-y-2">
            {anomalies.map(
              (a: { id: string; severity: string; message: string }) => (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn("inline-block w-2 h-2 rounded-full", {
                        "bg-red-500": a.severity === "high",
                        "bg-amber-500": a.severity === "medium",
                        "bg-yellow-400": a.severity === "low",
                      })}
                    />
                    <span className="text-sm text-amber-900">{a.message}</span>
                  </div>
                  <button
                    onClick={() => handleDismissAnomaly(a.id)}
                    className="text-amber-400 hover:text-amber-600 shrink-0"
                    title="Dismiss"
                  >
                    <span className="text-xs">Dismiss</span>
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Trend chart */}
      {chartData.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand" />
              Occupancy Trend (13 weeks)
            </h3>
            <div className="flex items-center gap-2">
              <AiButton
                templateSlug="hr/roster-suggestions"
                variables={{
                  centreName: serviceName || "This centre",
                  attendanceData: weekDates
                    .map((d) => {
                      const dateStr = formatDate(d);
                      const bsc = cells[buildCellKey(dateStr, "bsc")] ?? {
                        permanent: 0,
                        casual: 0,
                      };
                      const asc = cells[buildCellKey(dateStr, "asc")] ?? {
                        permanent: 0,
                        casual: 0,
                      };
                      return `${formatDayLabel(d)}: BSC ${bsc.permanent + bsc.casual} / ASC ${asc.permanent + asc.casual}`;
                    })
                    .join(", "),
                  staffData: "Check current roster for staff details",
                  regulations:
                    "1:15 ratio (school-age), 50% diploma-qualified per session (VIC)",
                }}
                onResult={(text) => {
                  setRosterSuggestion(text);
                  setRosterExpanded(true);
                }}
                label="Roster Suggestions"
                size="sm"
                section="hr"
              />
              <button
                onClick={handleForecast}
                disabled={forecastLoading}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors",
                  forecastLoading
                    ? "border-amber-300 text-amber-700 bg-amber-50"
                    : "border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100",
                  "disabled:cursor-not-allowed"
                )}
              >
                {forecastLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {forecastLoading ? "Forecasting..." : "Forecast Demand"}
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => v.replace(/^\d{4}-/, "")}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend />
              <Line
                type="monotone"
                dataKey="BSC %"
                stroke="#3B82F6"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="ASC %"
                stroke="#8B5CF6"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Demand Forecast Panel */}
      {forecast && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setForecastExpanded((v) => !v)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <h4 className="text-sm font-semibold text-purple-800 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Enrolment Demand Forecast
            </h4>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setForecast(null);
                }}
                className="text-purple-400 hover:text-purple-600"
              >
                <X className="w-4 h-4" />
              </button>
              {forecastExpanded ? (
                <ChevronUp className="w-4 h-4 text-purple-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-purple-400" />
              )}
            </div>
          </button>
          {forecastExpanded && (
            <div className="px-4 pb-4">
              <div className="text-sm text-purple-900 whitespace-pre-wrap prose prose-sm max-w-none">
                {forecast}
              </div>
              <p className="text-xs text-purple-500 mt-3">
                AI-generated forecast based on 13 weeks of attendance data and
                recent enquiry trends. Use as a guide alongside your own centre
                knowledge.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Roster Suggestions Panel */}
      {rosterSuggestion && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setRosterExpanded((v) => !v)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <h4 className="text-sm font-semibold text-purple-800 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Smart Roster Suggestions
            </h4>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setRosterSuggestion(null);
                }}
                className="text-purple-400 hover:text-purple-600"
              >
                <X className="w-4 h-4" />
              </button>
              {rosterExpanded ? (
                <ChevronUp className="w-4 h-4 text-purple-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-purple-400" />
              )}
            </div>
          </button>
          {rosterExpanded && (
            <div className="px-4 pb-4">
              <div className="text-sm text-purple-900 whitespace-pre-wrap prose prose-sm max-w-none">
                {rosterSuggestion}
              </div>
              <p className="text-xs text-purple-500 mt-3">
                AI-generated roster suggestions based on attendance patterns
                and regulatory requirements. Review with your coordinator
                before implementing.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Import Wizard */}
      {showImportAttendance && (
        <ImportWizard
          title="Import Attendance Data"
          endpoint="/api/attendance/import"
          columnConfig={attendanceImportColumns}
          onComplete={() => {
            // Refetch attendance data
            window.location.reload();
          }}
          onClose={() => setShowImportAttendance(false)}
        />
      )}

      {/* Weekly Data Entry Grid */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4 text-brand" />
              <span className="hidden sm:inline">
                Week Starting{" "}
                {weekDates[0].toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <span className="sm:hidden">
                {weekDates[0].toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </h3>
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => {
                  setWeekOffset((w) => w - 1);
                }}
                className="px-2 py-1 text-xs font-medium rounded-md border border-border hover:bg-surface/50"
              >
                ←
              </button>
              <button
                onClick={() => {
                  setWeekOffset(0);
                }}
                className="px-2 py-1 text-xs font-medium rounded-md border border-border hover:bg-surface/50"
                disabled={weekOffset === 0}
              >
                Today
              </button>
              <button
                onClick={() => {
                  setWeekOffset((w) => w + 1);
                }}
                className="px-2 py-1 text-xs font-medium rounded-md border border-border hover:bg-surface/50"
                disabled={weekOffset >= 0}
              >
                →
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowImportAttendance(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-border hover:bg-surface/50 text-muted"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Import CSV
            </button>
            <button
              onClick={() =>
                printAttendance(
                  visibleSessions,
                  cells,
                  weekDates,
                  approvedPlaces,
                  serviceName
                )
              }
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-border hover:bg-surface/50 text-muted"
              title="Print attendance"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print</span>
            </button>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={showHolidayQuest}
                onChange={(e) => setShowHolidayQuest(e.target.checked)}
                className="rounded border-border text-brand focus:ring-brand"
                aria-label="Show Holiday Quest row"
              />
              Show Holiday Quest
            </label>
          </div>
        </div>

        {loadingRecords ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 flex-1 hidden sm:block" />
                <Skeleton className="h-8 flex-1 hidden sm:block" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Mobile: Card layout per day */}
            <div className="sm:hidden space-y-3">
              {weekDates.map((date) => {
                const dateStr = formatDate(date);
                return (
                  <div
                    key={dateStr}
                    className="rounded-lg border border-border p-3 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-foreground">
                          {formatDayLabel(date)}
                        </span>
                        <span className="text-xs text-muted">
                          {formatDateLabel(date)}
                        </span>
                      </div>
                      <span className="text-xs text-muted">
                        Total{" "}
                        <span className="font-semibold text-foreground">
                          {visibleSessions.reduce((sum, s) => {
                            const v = cells[buildCellKey(dateStr, s)] ?? {
                              permanent: 0,
                              casual: 0,
                            };
                            return sum + v.permanent + v.casual;
                          }, 0)}
                        </span>
                      </span>
                    </div>
                    {visibleSessions.map((session) => {
                      const v = cells[buildCellKey(dateStr, session)] ?? {
                        permanent: 0,
                        casual: 0,
                      };
                      return (
                        <div key={session} className="space-y-1.5">
                          <span className="text-xs font-semibold text-foreground">
                            {SESSION_LABELS[session]}
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            {(["permanent", "casual"] as const).map((field) => (
                              <div key={field}>
                                <label className="text-[10px] text-muted uppercase">
                                  {BOOKING_TYPE_LABELS[field]}
                                </label>
                                <BookingInput
                                  value={v[field]}
                                  onCommit={(next) =>
                                    handleCellCommit(date, session, field, next)
                                  }
                                  ariaLabel={`${SESSION_LABELS[session]} ${BOOKING_TYPE_LABELS[field]} bookings for ${dateStr}`}
                                  className="w-full"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <div className="text-[10px] text-muted">
                      Approved places:{" "}
                      <span className="font-medium text-foreground">
                        {approvedPlaces ?? "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: Sessions × Days table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-xs font-medium text-muted w-48">
                      Session
                    </th>
                    {weekDates.map((d) => (
                      <th
                        key={formatDate(d)}
                        className="text-center py-2 px-2 text-xs font-medium text-muted border-l border-border/30"
                      >
                        <div className="font-semibold text-foreground">
                          {formatDayLabel(d)}
                        </div>
                        <div className="text-[10px] text-muted font-normal">
                          {formatDateLabel(d)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleSessions.map((session) => (
                    <Fragment key={session}>
                      <tr className="bg-surface/40">
                        <td
                          colSpan={weekDates.length + 1}
                          className="py-1.5 px-2 text-xs font-semibold text-foreground"
                        >
                          {SESSION_LABELS[session]}
                        </td>
                      </tr>
                      {(["permanent", "casual"] as const).map((field) => (
                        <tr
                          key={`${session}-${field}`}
                          className="border-b border-border/30 hover:bg-surface/30"
                        >
                          <td className="py-1.5 px-2 pl-6 text-xs text-muted">
                            {BOOKING_TYPE_LABELS[field]}
                          </td>
                          {weekDates.map((date) => {
                            const dateStr = formatDate(date);
                            const v = cells[buildCellKey(dateStr, session)] ?? {
                              permanent: 0,
                              casual: 0,
                            };
                            return (
                              <td
                                key={`${dateStr}-${session}-${field}`}
                                className="py-1 px-1 text-center border-l border-border/30"
                              >
                                <BookingInput
                                  value={v[field]}
                                  onCommit={(next) =>
                                    handleCellCommit(date, session, field, next)
                                  }
                                  ariaLabel={`${SESSION_LABELS[session]} ${BOOKING_TYPE_LABELS[field]} bookings for ${dateStr}`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-surface/30">
                    <td className="py-2 px-2 text-xs font-semibold text-foreground">
                      Total bookings
                    </td>
                    {dayTotals.map((total, i) => (
                      <td
                        key={`total-${i}`}
                        className="py-2 px-1 text-center text-sm font-semibold text-foreground border-l border-border/30"
                      >
                        {total}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 px-2 text-xs font-medium text-muted">
                      Approved places
                    </td>
                    {weekDates.map((date) => (
                      <td
                        key={`cap-${formatDate(date)}`}
                        className="py-2 px-1 text-center text-sm text-muted border-l border-border/30"
                      >
                        {approvedPlaces ?? "—"}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50 flex-wrap gap-2">
              <p className="text-xs text-muted flex items-center gap-1">
                <Info className="w-3.5 h-3.5" />
                Auto-saves when you leave each cell.
                <SaveIndicator state={saveState} />
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePropagate}
                  disabled={propagateMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-surface/50 text-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {propagateMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CopyPlus className="w-3.5 h-3.5" />
                  )}
                  Propagate to Future Weeks
                </button>
                <button
                  onClick={handleSave}
                  disabled={batchUpdate.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-brand text-white hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {batchUpdate.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save Week
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={showPropagateConfirm}
        onOpenChange={setShowPropagateConfirm}
        title="Propagate Permanent Counts"
        description="This will copy this week's permanent counts to the next 8 weeks. Continue?"
        confirmLabel="Propagate"
        variant="default"
        onConfirm={() => {
          propagateMutation.mutate();
          setShowPropagateConfirm(false);
        }}
        loading={propagateMutation.isPending}
      />
    </div>
  );
}

function SaveIndicator({
  state,
}: {
  state: "idle" | "saving" | "saved" | "error";
}) {
  if (state === "idle") return null;
  if (state === "saving")
    return (
      <span className="inline-flex items-center gap-1 ml-2 text-muted">
        <Loader2 className="w-3 h-3 animate-spin" />
        Saving…
      </span>
    );
  if (state === "saved")
    return (
      <span className="inline-flex items-center gap-1 ml-2 text-emerald-600">
        <Check className="w-3 h-3" />
        Saved
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 ml-2 text-red-600">
      <AlertTriangle className="w-3 h-3" />
      Retry
    </span>
  );
}

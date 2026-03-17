"use client";

import { useState, useMemo, useCallback } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ImportWizard, type ColumnConfig } from "@/components/import/ImportWizard";
import {
  useAttendance,
  useAttendanceSummary,
  useBatchUpdateAttendance,
  type AttendanceInput,
} from "@/hooks/useAttendance";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/useToast";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
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

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

type GridRow = {
  day: string;
  date: Date;
  bsc: { enrolled: number; attended: number };
  asc: { enrolled: number; attended: number };
};

export function ServiceAttendanceTab({ serviceId }: Props) {
  const anomalyQC = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [showVC, setShowVC] = useState(false);
  const [showImportAttendance, setShowImportAttendance] = useState(false);
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const from = formatDate(weekDates[0]);
  const to = formatDate(weekDates[4]);

  // 13-week trend data
  const thirteenWeeksAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 91);
    return formatDate(d);
  }, []);

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
      toast({ description: `Permanent counts propagated to future weeks (${data.propagated} records)` });
    },
    onError: () => {
      toast({ description: "Failed to propagate permanent counts" });
    },
  });

  const handlePropagate = () => {
    if (window.confirm("This will copy this week's permanent counts to the next 8 weeks. Continue?")) {
      propagateMutation.mutate();
    }
  };

  // Attendance anomalies
  const { data: anomalies } = useQuery({
    queryKey: ["attendance-anomalies", serviceId],
    queryFn: async () => {
      const res = await fetch(`/api/attendance/anomalies?serviceId=${serviceId}&dismissed=false`);
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
    anomalyQC.invalidateQueries({ queryKey: ["attendance-anomalies", serviceId] });
  };

  // Build editable grid state from server data
  const [gridEdits, setGridEdits] = useState<Record<string, number>>({});

  const grid: GridRow[] = useMemo(() => {
    return weekDates.map((date, i) => {
      const dateStr = formatDate(date);
      const bscRecord = records?.find(
        (r) =>
          r.date.startsWith(dateStr) && r.sessionType === "bsc"
      );
      const ascRecord = records?.find(
        (r) =>
          r.date.startsWith(dateStr) && r.sessionType === "asc"
      );

      return {
        day: DAYS[i],
        date,
        bsc: {
          enrolled: gridEdits[`${dateStr}-bsc-enrolled`] ?? bscRecord?.enrolled ?? 0,
          attended: gridEdits[`${dateStr}-bsc-attended`] ?? bscRecord?.attended ?? 0,
        },
        asc: {
          enrolled: gridEdits[`${dateStr}-asc-enrolled`] ?? ascRecord?.enrolled ?? 0,
          attended: gridEdits[`${dateStr}-asc-attended`] ?? ascRecord?.attended ?? 0,
        },
      };
    });
  }, [weekDates, records, gridEdits]);

  const handleCellChange = useCallback(
    (dateStr: string, session: string, field: string, value: number) => {
      setGridEdits((prev) => ({ ...prev, [`${dateStr}-${session}-${field}`]: value }));
    },
    []
  );

  const isDirty = Object.keys(gridEdits).length > 0;

  const handleSave = async () => {
    const inputs: AttendanceInput[] = [];
    for (const row of grid) {
      const dateStr = formatDate(row.date);
      inputs.push({
        serviceId,
        date: dateStr,
        sessionType: "bsc" as const,
        enrolled: row.bsc.enrolled,
        attended: row.bsc.attended,
        capacity: 0,
      });
      inputs.push({
        serviceId,
        date: dateStr,
        sessionType: "asc" as const,
        enrolled: row.asc.enrolled,
        attended: row.asc.attended,
        capacity: 0,
      });
    }
    await batchUpdate.mutateAsync(inputs);
    setGridEdits({});
  };

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
            {anomalies.map((a: { id: string; severity: string; message: string }) => (
              <div key={a.id} className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn("inline-block w-2 h-2 rounded-full", {
                    "bg-red-500": a.severity === "high",
                    "bg-amber-500": a.severity === "medium",
                    "bg-yellow-400": a.severity === "low",
                  })} />
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
            ))}
          </div>
        </div>
      )}

      {/* Trend chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand" />
            Occupancy Trend (13 weeks)
          </h3>
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
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-brand" />
              <span className="hidden sm:inline">Week Starting {weekDates[0].toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>
              <span className="sm:hidden">{weekDates[0].toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
            </h3>
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => { setWeekOffset((w) => w - 1); setGridEdits({}); }}
                className="px-2 py-1 text-xs font-medium rounded-md border border-gray-200 hover:bg-gray-50"
              >
                ←
              </button>
              <button
                onClick={() => { setWeekOffset(0); setGridEdits({}); }}
                className="px-2 py-1 text-xs font-medium rounded-md border border-gray-200 hover:bg-gray-50"
                disabled={weekOffset === 0}
              >
                Today
              </button>
              <button
                onClick={() => { setWeekOffset((w) => w + 1); setGridEdits({}); }}
                className="px-2 py-1 text-xs font-medium rounded-md border border-gray-200 hover:bg-gray-50"
                disabled={weekOffset >= 0}
              >
                →
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowImportAttendance(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-gray-200 hover:bg-gray-50 text-gray-600"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Import CSV
            </button>
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={showVC}
                onChange={(e) => setShowVC(e.target.checked)}
                className="rounded border-gray-300 text-brand focus:ring-brand"
              />
              Show VC
            </label>
          </div>
        </div>

        {loadingRecords ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2">
                <Skeleton className="h-8 w-16" />
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
              {grid.map((row) => {
                const dateStr = formatDate(row.date);
                return (
                  <div
                    key={dateStr}
                    className="rounded-lg border border-gray-200 p-3 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-gray-900">{row.day}</span>
                        <span className="text-xs text-gray-400">{formatDateLabel(row.date)}</span>
                      </div>
                    </div>
                    {(["bsc", "asc"] as const).map((session) => (
                      <div key={session} className="space-y-1.5">
                        <span className={cn(
                          "text-xs font-semibold uppercase tracking-wider",
                          session === "bsc" ? "text-blue-600" : "text-purple-600"
                        )}>
                          {session === "bsc" ? "BSC" : "ASC"}
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          {(["enrolled", "attended"] as const).map((field) => (
                            <div key={field}>
                              <label className="text-[10px] text-gray-400 uppercase">{field === "attended" ? "Casual" : "Perm."}</label>
                              <input
                                type="number"
                                min={0}
                                value={row[session][field]}
                                onChange={(e) =>
                                  handleCellChange(dateStr, session, field, parseInt(e.target.value) || 0)
                                }
                                className="w-full text-center text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Desktop: Full table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 w-24">
                      Day
                    </th>
                    <th
                      colSpan={2}
                      className="text-center py-2 px-2 text-xs font-semibold text-blue-600 border-l border-gray-100"
                    >
                      BSC (Before School)
                    </th>
                    <th
                      colSpan={2}
                      className="text-center py-2 px-2 text-xs font-semibold text-purple-600 border-l border-gray-100"
                    >
                      ASC (After School)
                    </th>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-1 px-2 text-xs text-gray-400" />
                    {["Permanent", "Casual Bookings"].map((h) => (
                      <th
                        key={`bsc-${h}`}
                        className="text-center py-1 px-1 text-xs text-gray-400 border-l border-gray-50"
                      >
                        {h}
                      </th>
                    ))}
                    {["Permanent", "Casual Bookings"].map((h) => (
                      <th
                        key={`asc-${h}`}
                        className="text-center py-1 px-1 text-xs text-gray-400 border-l border-gray-50"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.map((row) => {
                    const dateStr = formatDate(row.date);
                    return (
                      <tr key={dateStr} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-2 px-2">
                          <span className="font-medium text-gray-900">{row.day}</span>
                          <div className="text-xs text-gray-400">{formatDateLabel(row.date)}</div>
                        </td>
                        {(["bsc", "asc"] as const).map((session) =>
                          (["enrolled", "attended"] as const).map((field) => (
                            <td
                              key={`${session}-${field}`}
                              className="py-1 px-1 text-center border-l border-gray-50"
                            >
                              <input
                                type="number"
                                min={0}
                                value={row[session][field]}
                                onChange={(e) =>
                                  handleCellChange(
                                    dateStr,
                                    session,
                                    field,
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="w-16 text-center text-sm border border-gray-200 rounded-md px-1 py-1 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                              />
                            </td>
                          ))
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Info className="w-3.5 h-3.5" />
                Data auto-saves per cell on save. Upserts by date + session type.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePropagate}
                  disabled={propagateMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-gray-200 hover:bg-gray-50 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                  disabled={!isDirty || batchUpdate.isPending}
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

      {showVC && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-sm text-amber-700">
            Vacation Care tracking will use the same grid during school holiday periods.
            Toggle on during holidays to enter VC data.
          </p>
        </div>
      )}
    </div>
  );
}


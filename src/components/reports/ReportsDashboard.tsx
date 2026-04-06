"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import { PageHeader } from "@/components/layout/PageHeader";
import { AttendanceReport } from "./AttendanceReport";
import { BookingsReport } from "./BookingsReport";
import { RevenueReport } from "./RevenueReport";
import { EnrolmentsReport } from "./EnrolmentsReport";
import { MedicalAlertsReport } from "./MedicalAlertsReport";
import { cn } from "@/lib/utils";

const TABS = ["Attendance", "Bookings", "Revenue", "Enrolments", "Medical Alerts"] as const;
type Tab = (typeof TABS)[number];

const PRESETS = [
  { label: "This Week", getValue: () => getWeekRange(0) },
  { label: "This Month", getValue: () => getMonthRange(0) },
  { label: "Last Month", getValue: () => getMonthRange(-1) },
  { label: "This Term", getValue: () => getTermRange() },
] as const;

function getWeekRange(offset: number) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - start.getDay() + offset * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { from: fmt(start), to: fmt(end) };
}

function getMonthRange(offset: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: fmt(start), to: fmt(end) };
}

function getTermRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  // Australian school terms (approximate)
  if (m <= 2) return { from: `${y}-01-28`, to: `${y}-04-05` };
  if (m <= 5) return { from: `${y}-04-22`, to: `${y}-06-27` };
  if (m <= 8) return { from: `${y}-07-14`, to: `${y}-09-19` };
  return { from: `${y}-10-06`, to: `${y}-12-18` };
}

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function ReportsDashboard() {
  const [tab, setTab] = useState<Tab>("Attendance");
  const [serviceId, setServiceId] = useState("");
  const [dateRange, setDateRange] = useState(() => getMonthRange(0));

  const { data: services } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["services-list"],
    queryFn: () => fetchApi("/api/services"),
    retry: 2,
    staleTime: 60_000,
  });

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (serviceId) p.set("serviceId", serviceId);
    p.set("dateFrom", dateRange.from);
    p.set("dateTo", dateRange.to);
    return p.toString();
  }, [serviceId, dateRange]);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports & Analytics" description="Operational summaries and data exports" />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 bg-card rounded-xl border border-border p-4">
        <select
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-white text-foreground"
        >
          <option value="">All Services</option>
          {services?.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setDateRange(p.getValue())}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                dateRange.from === p.getValue().from
                  ? "bg-[#004E64] text-white"
                  : "bg-surface text-muted hover:bg-[#004E64]/10",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))}
            className="text-sm border border-border rounded-lg px-2 py-1.5 bg-white"
          />
          <span className="text-muted text-xs">to</span>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))}
            className="text-sm border border-border rounded-lg px-2 py-1.5 bg-white"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px",
              tab === t
                ? "border-[#004E64] text-[#004E64]"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "Attendance" && <AttendanceReport params={params} />}
      {tab === "Bookings" && <BookingsReport params={params} />}
      {tab === "Revenue" && <RevenueReport params={params} />}
      {tab === "Enrolments" && <EnrolmentsReport params={params} />}
      {tab === "Medical Alerts" && <MedicalAlertsReport serviceId={serviceId} />}
    </div>
  );
}

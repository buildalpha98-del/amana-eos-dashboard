"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuditInstances, type AuditInstanceSummary } from "@/hooks/useAudits";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Play,
  SkipForward,
  Loader2,
  Filter,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const qaLabels: Record<number, string> = {
  1: "Educational Program",
  2: "Health & Safety",
  3: "Physical Environment",
  4: "Staffing",
  5: "Relationships",
  6: "Partnerships",
  7: "Governance",
};

const statusConfig: Record<string, { color: string; bg: string; border: string; icon: typeof Clock }> = {
  scheduled: { color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", icon: Clock },
  in_progress: { color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", icon: Play },
  completed: { color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", icon: CheckCircle2 },
  overdue: { color: "text-red-700", bg: "bg-red-50", border: "border-red-200", icon: AlertTriangle },
  skipped: { color: "text-gray-500", bg: "bg-gray-50", border: "border-gray-200", icon: SkipForward },
};

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function AuditCalendarTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [serviceFilter, setServiceFilter] = useState("");
  const [qaFilter, setQaFilter] = useState("");

  const { data, isLoading } = useAuditInstances({
    year,
    serviceId: serviceFilter || undefined,
    qualityArea: qaFilter || undefined,
  });

  const { data: services = [] } = useQuery<ServiceOption[]>({
    queryKey: ["services"],
    queryFn: async () => {
      const res = await fetch("/api/services?limit=100");
      if (!res.ok) return [];
      const d = await res.json();
      return d.services || d;
    },
  });

  // Group instances by month
  const byMonth = useMemo(() => {
    const map: Record<number, AuditInstanceSummary[]> = {};
    for (let m = 1; m <= 12; m++) map[m] = [];
    if (data?.instances) {
      for (const inst of data.instances) {
        if (!map[inst.scheduledMonth]) map[inst.scheduledMonth] = [];
        map[inst.scheduledMonth].push(inst);
      }
    }
    return map;
  }, [data?.instances]);

  const stats = data?.stats;

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Scheduled", value: stats.scheduled, color: "text-blue-700 bg-blue-50" },
            { label: "In Progress", value: stats.in_progress, color: "text-amber-700 bg-amber-50" },
            { label: "Completed", value: stats.completed, color: "text-emerald-700 bg-emerald-50" },
            { label: "Overdue", value: stats.overdue, color: "text-red-700 bg-red-50" },
            {
              label: "Avg Score",
              value: stats.avgScore != null ? `${stats.avgScore}%` : "—",
              color: "text-brand bg-brand/5",
            },
          ].map((s) => (
            <div key={s.label} className={cn("rounded-xl p-4 text-center", s.color)}>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs font-medium mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[4rem] text-center">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
        >
          <option value="">All Centres</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={qaFilter}
          onChange={(e) => setQaFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
        >
          <option value="">All Quality Areas</option>
          {[1, 2, 3, 4, 5, 6, 7].map((qa) => (
            <option key={qa} value={String(qa)}>
              QA{qa} — {qaLabels[qa]}
            </option>
          ))}
        </select>
      </div>

      {/* Calendar grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-brand animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
            const audits = byMonth[month] || [];
            const isPast = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);
            const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;

            return (
              <div
                key={month}
                className={cn(
                  "rounded-xl border p-4 transition-colors",
                  isCurrent
                    ? "border-brand bg-brand/5 ring-1 ring-brand/20"
                    : "border-gray-200 bg-white"
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <h4
                    className={cn(
                      "text-sm font-semibold",
                      isCurrent ? "text-brand" : isPast ? "text-gray-400" : "text-gray-900"
                    )}
                  >
                    {monthNames[month - 1]}
                  </h4>
                  {audits.length > 0 && (
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      {audits.length}
                    </span>
                  )}
                </div>

                {audits.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No audits scheduled</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {audits.map((audit) => {
                      const cfg = statusConfig[audit.status] || statusConfig.scheduled;
                      const Icon = cfg.icon;
                      return (
                        <Link
                          key={audit.id}
                          href={`/compliance/audit/${audit.id}`}
                          className={cn(
                            "block p-2 rounded-lg border text-left hover:shadow-sm transition-all",
                            cfg.bg,
                            cfg.border
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <Icon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", cfg.color)} />
                            <div className="min-w-0">
                              <p className={cn("text-xs font-medium truncate", cfg.color)}>
                                {audit.template.name}
                              </p>
                              <p className="text-[10px] text-gray-500 truncate">
                                {audit.service.code} · QA{audit.template.qualityArea}
                                {audit.complianceScore != null && ` · ${audit.complianceScore}%`}
                              </p>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuditInstances, type AuditInstanceSummary } from "@/hooks/useAudits";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Play,
  SkipForward,
  Loader2,
  ShieldCheck,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  scheduled: { label: "Scheduled", color: "bg-blue-100 text-blue-700", icon: Clock },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700", icon: Play },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  overdue: { label: "Overdue", color: "bg-red-100 text-red-700", icon: AlertTriangle },
  skipped: { label: "Skipped", color: "bg-gray-100 text-gray-500", icon: SkipForward },
};

function scoreColor(score: number | null) {
  if (score == null) return "text-gray-400";
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

export function ServiceAuditsTab({ serviceId }: { serviceId: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useAuditInstances({
    serviceId,
    year,
    status: statusFilter || undefined,
  });

  const instances = data?.instances || [];
  const stats = data?.stats;

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Scheduled", value: stats.scheduled, color: "text-blue-700 bg-blue-50" },
            { label: "In Progress", value: stats.in_progress, color: "text-amber-700 bg-amber-50" },
            { label: "Completed", value: stats.completed, color: "text-emerald-700 bg-emerald-50" },
            { label: "Overdue", value: stats.overdue, color: "text-red-700 bg-red-50" },
            {
              label: "Avg Score",
              value: stats.avgScore != null ? `${stats.avgScore}%` : "—",
              color: "text-[#004E64] bg-[#004E64]/5",
            },
          ].map((s) => (
            <div key={s.label} className={cn("rounded-lg p-3 text-center", s.color)}>
              <div className="text-xl font-bold">{s.value}</div>
              <div className="text-xs font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="p-1 rounded border border-gray-200 hover:bg-gray-50"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[3rem] text-center">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="p-1 rounded border border-gray-200 hover:bg-gray-50"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]"
        >
          <option value="">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {/* Audit list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-[#004E64] animate-spin" />
        </div>
      ) : instances.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No audits found for {year}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {instances.map((inst) => {
            const cfg = statusConfig[inst.status] || statusConfig.scheduled;
            const Icon = cfg.icon;
            return (
              <Link
                key={inst.id}
                href={`/compliance/audit/${inst.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-[#004E64]/20 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#004E64]/10 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-4 h-4 text-[#004E64]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{inst.template.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-mono bg-[#004E64]/10 text-[#004E64] px-1.5 py-0.5 rounded">
                          QA{inst.template.qualityArea}
                        </span>
                        <span className="text-xs text-gray-500">{inst.template.nqsReference}</span>
                        <span className="text-xs text-gray-400">
                          Due {new Date(inst.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {inst.complianceScore != null && (
                      <span className={cn("text-sm font-bold", scoreColor(inst.complianceScore))}>
                        {inst.complianceScore}%
                      </span>
                    )}
                    <span className={cn("px-2.5 py-1 text-xs font-medium rounded-full inline-flex items-center gap-1", cfg.color)}>
                      <Icon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

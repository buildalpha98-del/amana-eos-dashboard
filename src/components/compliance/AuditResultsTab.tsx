"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuditInstances, type AuditInstanceSummary } from "@/hooks/useAudits";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Play,
  SkipForward,
  Loader2,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const statusConfig: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Scheduled", color: "bg-blue-100 text-blue-700" },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700" },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-700" },
  overdue: { label: "Overdue", color: "bg-red-100 text-red-700" },
  skipped: { label: "Skipped", color: "bg-gray-100 text-gray-500" },
};

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function scoreColor(score: number | null) {
  if (score == null) return "text-gray-400";
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function AuditResultsTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [serviceFilter, setServiceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [qaFilter, setQaFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading } = useAuditInstances({
    year,
    serviceId: serviceFilter || undefined,
    status: statusFilter || undefined,
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

  // Filter by search term
  const filteredInstances = useMemo(() => {
    if (!data?.instances) return [];
    if (!searchTerm.trim()) return data.instances;
    const term = searchTerm.toLowerCase();
    return data.instances.filter(
      (i) =>
        i.template.name.toLowerCase().includes(term) ||
        i.service.name.toLowerCase().includes(term) ||
        i.auditorName?.toLowerCase().includes(term)
    );
  }, [data?.instances, searchTerm]);

  // Export to CSV
  const handleExport = () => {
    if (!filteredInstances.length) return;
    const headers = [
      "Audit Name",
      "Quality Area",
      "NQS Reference",
      "Centre",
      "Month",
      "Status",
      "Due Date",
      "Completed",
      "Score (%)",
      "Yes",
      "No",
      "N/A",
      "Auditor",
    ];
    const rows = filteredInstances.map((i) => [
      i.template.name,
      `QA${i.template.qualityArea}`,
      i.template.nqsReference,
      i.service.name,
      `${i.scheduledMonth}/${i.scheduledYear}`,
      i.status,
      formatDate(i.dueDate),
      formatDate(i.completedAt),
      i.complianceScore ?? "",
      i.yesCount,
      i.noCount,
      i.naCount,
      i.auditorName || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-results-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[4rem] text-center">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search audits..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
          />
        </div>

        <select
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]"
        >
          <option value="">All Centres</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

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
          <option value="skipped">Skipped</option>
        </select>

        <select
          value={qaFilter}
          onChange={(e) => setQaFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64]"
        >
          <option value="">All QAs</option>
          {[1, 2, 3, 4, 5, 6, 7].map((qa) => (
            <option key={qa} value={String(qa)}>QA{qa}</option>
          ))}
        </select>

        <button
          onClick={handleExport}
          disabled={filteredInstances.length === 0}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 ml-auto"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#004E64] animate-spin" />
        </div>
      ) : filteredInstances.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No audit results found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Audit</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Centre</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">QA</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Month</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Score</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Y / N / NA</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Auditor</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredInstances.map((inst) => {
                  const cfg = statusConfig[inst.status] || statusConfig.scheduled;
                  return (
                    <tr key={inst.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 truncate max-w-[200px]">
                          {inst.template.name}
                        </p>
                        <p className="text-xs text-gray-500">{inst.template.nqsReference}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{inst.service.code}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-mono font-medium bg-[#004E64]/10 text-[#004E64] px-2 py-0.5 rounded">
                          QA{inst.template.qualityArea}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        {inst.scheduledMonth}/{inst.scheduledYear}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", cfg.color)}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className={cn("px-4 py-3 text-center font-bold", scoreColor(inst.complianceScore))}>
                        {inst.complianceScore != null ? `${inst.complianceScore}%` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-600">
                        <span className="text-emerald-600">{inst.yesCount}</span>
                        {" / "}
                        <span className="text-red-600">{inst.noCount}</span>
                        {" / "}
                        <span className="text-gray-400">{inst.naCount}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 truncate max-w-[120px]">
                        {inst.auditorName || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/compliance/audit/${inst.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#004E64] hover:text-[#003D52] transition-colors"
                        >
                          View
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

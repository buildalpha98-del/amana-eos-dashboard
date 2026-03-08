"use client";

import { useState } from "react";
import {
  FileSpreadsheet,
  Send,
  Download,
  Loader2,
  DollarSign,
  BarChart3,
  Users,
  ShieldCheck,
  TrendingUp,
  Mountain,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Mail,
  ChevronDown,
} from "lucide-react";
import { ReportSection } from "@/components/board-report/ReportSection";
import {
  useBoardReports,
  useBoardReport,
  useGenerateBoardReport,
  useUpdateBoardReport,
  useSendBoardReport,
} from "@/hooks/useBoardReports";
import { toast } from "@/hooks/useToast";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function StatusBadge({ status }: { status: "draft" | "final" | "sent" }) {
  const config = {
    draft: { label: "Draft", bg: "bg-gray-100", text: "text-gray-600" },
    final: { label: "Final", bg: "bg-blue-50", text: "text-blue-700" },
    sent: { label: "Sent", bg: "bg-green-50", text: "text-green-700" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {status === "sent" && <CheckCircle2 className="w-3 h-3" />}
      {status === "draft" && <Clock className="w-3 h-3" />}
      {status === "final" && <Mail className="w-3 h-3" />}
      {config.label}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
      <p className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
      <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{label}</p>
    </div>
  );
}

function fmtCurrency(n: number): string {
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function BoardReportsPage() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [aiGenerating, setAiGenerating] = useState<string | null>(null);

  const { data: reports, isLoading: listLoading } = useBoardReports();
  const { data: report, isLoading: reportLoading } = useBoardReport(selectedReportId);
  const generateMutation = useGenerateBoardReport();
  const updateMutation = useUpdateBoardReport(selectedReportId || "");
  const sendMutation = useSendBoardReport(selectedReportId || "");

  const handleGenerate = () => {
    generateMutation.mutate(
      { month: selectedMonth, year: selectedYear },
      { onSuccess: (data) => setSelectedReportId(data.id) },
    );
  };

  const handleNarrativeUpdate = (field: string, value: string) => {
    if (!selectedReportId) return;
    updateMutation.mutate({ [field]: value });
  };

  const handleAiGenerate = async (section: string, narrativeField: string) => {
    if (!selectedReportId || aiGenerating) return;
    setAiGenerating(section);
    try {
      const res = await fetch(`/api/reports/board/${selectedReportId}/ai-narrative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "AI generation failed");
      }
      const { narrative } = await res.json();
      handleNarrativeUpdate(narrativeField, narrative);
      toast({ description: "AI narrative generated" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "AI generation failed";
      toast({ description: msg, variant: "destructive" });
    } finally {
      setAiGenerating(null);
    }
  };

  const handleSend = () => {
    if (!selectedReportId) return;
    sendMutation.mutate(undefined);
  };

  const handleExportPdf = () => {
    window.print();
  };

  // ── Report Detail View ───────────────────────────────────
  if (selectedReportId) {
    if (reportLoading || !report) {
      return (
        <div className="space-y-6">
          <div className="h-8 w-32 bg-gray-100 rounded animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                <div className="h-8 w-20 bg-gray-100 rounded mx-auto mb-2" />
                <div className="h-3 w-16 bg-gray-100 rounded mx-auto" />
              </div>
            ))}
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-5 w-40 bg-gray-100 rounded mb-3" />
              <div className="h-20 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      );
    }

    const d = report.data;
    const avgOcc = Math.round((d.operations.avgBscOccupancy + d.operations.avgAscOccupancy) / 2);
    const monthLabel = `${MONTHS[report.month - 1]} ${report.year}`;

    return (
      <div className="space-y-6">
        {/* Back + Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedReportId(null)}
              className="no-print p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{monthLabel} Board Report</h2>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={report.status as "draft" | "final" | "sent"} />
                <span className="text-xs text-gray-400">
                  Generated {new Date(report.generatedAt).toLocaleDateString("en-AU")}
                </span>
              </div>
            </div>
          </div>
          <div className="no-print flex items-center gap-2">
            <button
              onClick={handleExportPdf}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
            >
              <Download className="w-4 h-4" /> Export PDF
            </button>
            <button
              onClick={handleSend}
              disabled={sendMutation.isPending}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg text-white bg-[#004E64] hover:bg-[#003344] disabled:opacity-50"
            >
              {sendMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Send to Board
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label="Revenue" value={fmtCurrency(d.financial.totalRevenue)} color="#10B981" />
          <StatCard label="Margin" value={`${Math.round(d.financial.avgMargin)}%`} color="#3B82F6" />
          <StatCard label="Occupancy" value={`${avgOcc}%`} color="#8B5CF6" />
          <StatCard label="Headcount" value={String(d.people.activeStaff)} color="#F59E0B" />
          <StatCard
            label="Rocks On Track"
            value={`${d.rocks.onTrack + d.rocks.complete}/${d.rocks.total}`}
            color="#004E64"
          />
        </div>

        {/* Report Sections */}
        <ReportSection
          icon={FileSpreadsheet}
          iconColor="#004E64"
          title="Executive Summary"
          narrative={report.executiveSummary}
          onNarrativeChange={(v) => handleNarrativeUpdate("executiveSummary", v)}
          onAiGenerate={() => handleAiGenerate("executive", "executiveSummary")}
          aiGenerating={aiGenerating === "executive"}
        >
          <p className="text-sm text-gray-500">
            High-level overview of {monthLabel} performance.
          </p>
        </ReportSection>

        <ReportSection
          icon={DollarSign}
          iconColor="#10B981"
          title="Financial Performance"
          narrative={report.financialNarrative}
          onNarrativeChange={(v) => handleNarrativeUpdate("financialNarrative", v)}
          onAiGenerate={() => handleAiGenerate("financial", "financialNarrative")}
          aiGenerating={aiGenerating === "financial"}
        >
          {d.financial.revenueByService.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                    <th className="pb-2">Centre</th>
                    <th className="pb-2 text-right">Revenue</th>
                    <th className="pb-2 text-right">Costs</th>
                    <th className="pb-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {d.financial.revenueByService.map((s) => (
                    <tr key={s.serviceName}>
                      <td className="py-2 text-gray-700 font-medium">{s.serviceName}</td>
                      <td className="py-2 text-right text-gray-600 tabular-nums">
                        {fmtCurrency(s.revenue)}
                      </td>
                      <td className="py-2 text-right text-gray-600 tabular-nums">
                        {fmtCurrency(s.costs)}
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums" style={{
                        color: s.margin >= 20 ? "#10B981" : s.margin >= 10 ? "#F59E0B" : "#EF4444",
                      }}>
                        {Math.round(s.margin)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 font-semibold text-gray-800">
                    <td className="pt-2">Total</td>
                    <td className="pt-2 text-right tabular-nums">{fmtCurrency(d.financial.totalRevenue)}</td>
                    <td className="pt-2 text-right tabular-nums">{fmtCurrency(d.financial.totalCosts)}</td>
                    <td className="pt-2 text-right tabular-nums" style={{
                      color: d.financial.avgMargin >= 20 ? "#10B981" : d.financial.avgMargin >= 10 ? "#F59E0B" : "#EF4444",
                    }}>
                      {Math.round(d.financial.avgMargin)}%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">No financial data for this period.</p>
          )}
          {d.financial.revenueTrend != null && (
            <p className="text-xs text-gray-500 mt-3">
              vs. prior month:{" "}
              <span className={d.financial.revenueTrend >= 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                {d.financial.revenueTrend >= 0 ? "+" : ""}{Math.round(d.financial.revenueTrend)}%
              </span>
            </p>
          )}
        </ReportSection>

        <ReportSection
          icon={BarChart3}
          iconColor="#8B5CF6"
          title="Operational Metrics"
          narrative={report.operationsNarrative}
          onNarrativeChange={(v) => handleNarrativeUpdate("operationsNarrative", v)}
          onAiGenerate={() => handleAiGenerate("operations", "operationsNarrative")}
          aiGenerating={aiGenerating === "operations"}
        >
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-lg font-bold text-[#3B82F6] tabular-nums">{d.operations.avgBscOccupancy}%</p>
              <p className="text-xs text-gray-500">BSC Occupancy</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-lg font-bold text-[#8B5CF6] tabular-nums">{d.operations.avgAscOccupancy}%</p>
              <p className="text-xs text-gray-500">ASC Occupancy</p>
            </div>
          </div>
          {d.operations.occupancyByService.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                    <th className="pb-2">Centre</th>
                    <th className="pb-2 text-right">BSC %</th>
                    <th className="pb-2 text-right">ASC %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {d.operations.occupancyByService.map((s) => (
                    <tr key={s.serviceName}>
                      <td className="py-1.5 text-gray-700">{s.serviceName}</td>
                      <td className="py-1.5 text-right tabular-nums font-medium" style={{
                        color: s.bsc >= 75 ? "#10B981" : s.bsc >= 50 ? "#F59E0B" : "#EF4444",
                      }}>{s.bsc}%</td>
                      <td className="py-1.5 text-right tabular-nums font-medium" style={{
                        color: s.asc >= 75 ? "#10B981" : s.asc >= 50 ? "#F59E0B" : "#EF4444",
                      }}>{s.asc}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ReportSection>

        <ReportSection
          icon={ShieldCheck}
          iconColor="#F59E0B"
          title="Compliance Status"
          narrative={report.complianceNarrative}
          onNarrativeChange={(v) => handleNarrativeUpdate("complianceNarrative", v)}
          onAiGenerate={() => handleAiGenerate("compliance", "complianceNarrative")}
          aiGenerating={aiGenerating === "compliance"}
        >
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-lg font-bold text-gray-700 tabular-nums">{d.compliance.totalCerts}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
            <div className="text-center p-3 bg-amber-50 rounded-lg">
              <p className="text-lg font-bold text-amber-600 tabular-nums">{d.compliance.expiringSoon}</p>
              <p className="text-xs text-gray-500">Expiring Soon</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <p className="text-lg font-bold text-red-600 tabular-nums">{d.compliance.expired}</p>
              <p className="text-xs text-gray-500">Expired</p>
            </div>
          </div>
        </ReportSection>

        <ReportSection
          icon={TrendingUp}
          iconColor="#3B82F6"
          title="Growth & Pipeline"
          narrative={report.growthNarrative}
          onNarrativeChange={(v) => handleNarrativeUpdate("growthNarrative", v)}
          onAiGenerate={() => handleAiGenerate("growth", "growthNarrative")}
          aiGenerating={aiGenerating === "growth"}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-lg font-bold text-gray-700 tabular-nums">{d.growth.totalLeads}</p>
              <p className="text-xs text-gray-500">Total Leads</p>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-lg font-bold text-blue-600 tabular-nums">{d.growth.newThisMonth}</p>
              <p className="text-xs text-gray-500">New</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-lg font-bold text-green-600 tabular-nums">{d.growth.wonThisMonth}</p>
              <p className="text-xs text-gray-500">Won</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <p className="text-lg font-bold text-red-600 tabular-nums">{d.growth.lostThisMonth}</p>
              <p className="text-xs text-gray-500">Lost</p>
            </div>
          </div>
        </ReportSection>

        <ReportSection
          icon={Users}
          iconColor="#F97316"
          title="People"
          narrative={report.peopleNarrative}
          onNarrativeChange={(v) => handleNarrativeUpdate("peopleNarrative", v)}
          onAiGenerate={() => handleAiGenerate("people", "peopleNarrative")}
          aiGenerating={aiGenerating === "people"}
        >
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-800 tabular-nums">{d.people.activeStaff}</p>
              <p className="text-xs text-gray-500">Active Staff</p>
            </div>
            {Object.keys(d.people.contractBreakdown).length > 0 && (
              <div className="flex-1">
                <p className="text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Contract Types</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(d.people.contractBreakdown).map(([type, count]) => (
                    <span
                      key={type}
                      className="px-2 py-1 bg-gray-50 border border-gray-100 rounded text-xs text-gray-600"
                    >
                      {type.replace("ct_", "").replace(/_/g, " ")}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ReportSection>

        <ReportSection
          icon={Mountain}
          iconColor="#004E64"
          title={`Quarterly Rocks — ${d.rocks.quarter}`}
          narrative={report.rocksNarrative}
          onNarrativeChange={(v) => handleNarrativeUpdate("rocksNarrative", v)}
          onAiGenerate={() => handleAiGenerate("rocks", "rocksNarrative")}
          aiGenerating={aiGenerating === "rocks"}
        >
          {d.rocks.rockList.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div className="text-center p-2 bg-green-50 rounded-lg">
                  <p className="text-lg font-bold text-green-600 tabular-nums">{d.rocks.onTrack}</p>
                  <p className="text-xs text-gray-500">On Track</p>
                </div>
                <div className="text-center p-2 bg-red-50 rounded-lg">
                  <p className="text-lg font-bold text-red-600 tabular-nums">{d.rocks.offTrack}</p>
                  <p className="text-xs text-gray-500">Off Track</p>
                </div>
                <div className="text-center p-2 bg-blue-50 rounded-lg">
                  <p className="text-lg font-bold text-blue-600 tabular-nums">{d.rocks.complete}</p>
                  <p className="text-xs text-gray-500">Complete</p>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded-lg">
                  <p className="text-lg font-bold text-gray-500 tabular-nums">{d.rocks.avgCompletion}%</p>
                  <p className="text-xs text-gray-500">Avg</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                      <th className="pb-2">Rock</th>
                      <th className="pb-2">Owner</th>
                      <th className="pb-2 text-right">Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {d.rocks.rockList.map((r, idx) => (
                      <tr key={`${r.title}-${r.owner}-${idx}`}>
                        <td className="py-1.5 text-gray-700">{r.title}</td>
                        <td className="py-1.5 text-gray-500">{r.owner}</td>
                        <td className="py-1.5 text-right">
                          <span className="tabular-nums font-medium" style={{
                            color: r.status === "complete" ? "#10B981" : r.status === "on_track" ? "#3B82F6" : "#EF4444",
                          }}>
                            {r.percentComplete}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 italic">No rocks for {d.rocks.quarter}.</p>
          )}
        </ReportSection>
      </div>
    );
  }

  // ── History View (default) ──────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "#004E6415", color: "#004E64" }}
          >
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Board Reports</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Monthly board & investor report generator
            </p>
          </div>
        </div>
      </div>

      {/* Generate Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Generate Report</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Month</label>
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#004E64]/20"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Year</label>
            <div className="relative">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#004E64]/20"
              >
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white bg-[#004E64] hover:bg-[#003344] disabled:opacity-50"
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            Generate Report
          </button>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Report History</h3>
        </div>
        {listLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : reports && reports.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wider bg-gray-50">
                  <th className="px-5 py-3">Period</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Generated</th>
                  <th className="px-5 py-3">Sent</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-700">
                      {MONTHS[r.month - 1]} {r.year}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-3 text-gray-500 tabular-nums">
                      {new Date(r.generatedAt).toLocaleDateString("en-AU")}
                    </td>
                    <td className="px-5 py-3 text-gray-500 tabular-nums">
                      {r.sentAt ? new Date(r.sentAt).toLocaleDateString("en-AU") : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => setSelectedReportId(r.id)}
                        className="text-sm text-[#004E64] hover:underline font-medium"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <FileSpreadsheet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No reports generated yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Select a month and year above, then click Generate Report.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

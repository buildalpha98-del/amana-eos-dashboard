"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Plus, Users, Clock, CheckCircle2, Search } from "lucide-react";
import { ExportButton } from "@/components/ui/ExportButton";
import { exportToCsv } from "@/lib/csv-export";
import { ServiceFilter } from "@/components/marketing/ServiceFilter";
import { NewVacancyModal } from "@/components/recruitment/NewVacancyModal";
import { VacancyTable } from "@/components/recruitment/VacancyTable";
import { VacancyDetailPanel } from "@/components/recruitment/VacancyDetailPanel";
import { ErrorState } from "@/components/ui/ErrorState";
import { toast } from "@/hooks/useToast";

export default function RecruitmentPage() {
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showNewVacancy, setShowNewVacancy] = useState(false);
  const [selectedVacancyId, setSelectedVacancyId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["recruitment-vacancies", selectedServiceId, statusFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedServiceId) params.set("serviceId", selectedServiceId);
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("q", search);
      const res = await fetch(`/api/recruitment?${params}`);
      if (!res.ok) throw new Error("Failed to fetch vacancies");
      return res.json();
    },
  });

  const vacancies = data?.vacancies || [];

  const stats = {
    open: vacancies.filter((v: { status: string }) => v.status === "open").length,
    interviewing: vacancies.filter((v: { status: string }) => v.status === "interviewing").length,
    offered: vacancies.filter((v: { status: string }) => v.status === "offered").length,
    filled: vacancies.filter((v: { status: string }) => v.status === "filled").length,
  };

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <ErrorState
          title="Failed to load vacancies"
          error={error instanceof Error ? error : new Error("Something went wrong while fetching the recruitment pipeline.")}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            Recruitment Pipeline
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Track vacancies, candidates, and staff referrals
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ServiceFilter value={selectedServiceId} onChange={setSelectedServiceId} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="interviewing">Interviewing</option>
            <option value="offered">Offered</option>
            <option value="filled">Filled</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vacancies..."
              aria-label="Search vacancies"
              className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent w-full sm:w-48"
            />
          </div>
          <ExportButton
            onClick={() =>
              exportToCsv(
                `amana-recruitment-${new Date().toISOString().slice(0, 10)}`,
                vacancies,
                [
                  { header: "ID", accessor: (v: Record<string, unknown>) => v.id as string },
                  { header: "Title", accessor: (v: Record<string, unknown>) => v.title as string },
                  { header: "Status", accessor: (v: Record<string, unknown>) => v.status as string },
                  { header: "Department", accessor: (v: Record<string, unknown>) => (v.department as string) ?? "" },
                  { header: "Employment Type", accessor: (v: Record<string, unknown>) => (v.employmentType as string) ?? "" },
                  { header: "Centre", accessor: (v: Record<string, unknown>) => ((v.service as Record<string, unknown>)?.name as string) ?? "" },
                  { header: "Candidates", accessor: (v: Record<string, unknown>) => ((v._count as Record<string, unknown>)?.candidates as number) ?? 0 },
                  { header: "Created", accessor: (v: Record<string, unknown>) => v.createdAt ? new Date(v.createdAt as string).toLocaleDateString("en-AU") : "" },
                ],
              )
            }
            disabled={vacancies.length === 0}
          />
          <button
            onClick={() => setShowNewVacancy(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Vacancy
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Briefcase} label="Open" value={stats.open} color="blue" />
        <StatCard icon={Users} label="Interviewing" value={stats.interviewing} color="amber" />
        <StatCard icon={Clock} label="Offered" value={stats.offered} color="purple" />
        <StatCard icon={CheckCircle2} label="Filled" value={stats.filled} color="emerald" />
      </div>

      {/* Empty State */}
      {!isLoading && vacancies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="p-4 bg-gray-100 rounded-full mb-4">
            <Briefcase className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No vacancies found</h3>
          <p className="text-sm text-gray-500 mb-4">
            {search || statusFilter || selectedServiceId
              ? "Try adjusting your filters or search terms."
              : "Get started by creating your first vacancy."}
          </p>
          <button
            onClick={() => setShowNewVacancy(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-hover transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Vacancy
          </button>
        </div>
      ) : (
        /* Vacancy Table */
        <VacancyTable
          vacancies={vacancies}
          isLoading={isLoading}
          onSelect={(id) => setSelectedVacancyId(id)}
        />
      )}

      {/* New Vacancy Modal */}
      {showNewVacancy && (
        <NewVacancyModal
          onClose={() => setShowNewVacancy(false)}
          onCreated={() => {
            setShowNewVacancy(false);
            refetch();
            toast({ title: "Vacancy created", description: "The new vacancy has been added to the pipeline." });
          }}
        />
      )}

      {/* Detail Panel */}
      {selectedVacancyId && (
        <VacancyDetailPanel
          vacancyId={selectedVacancyId}
          onClose={() => setSelectedVacancyId(null)}
          onUpdated={() => refetch()}
        />
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-purple-50 text-purple-600",
    emerald: "bg-emerald-50 text-emerald-600",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

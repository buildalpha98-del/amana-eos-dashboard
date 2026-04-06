"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { Download, Printer, Search, AlertTriangle, Pill } from "lucide-react";

interface MedicalChild {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  serviceName: string;
  medicalConditions: string[];
  dietaryRequirements: string[];
  medicationDetails: string | null;
  anaphylaxisActionPlan: string | null;
  additionalNeeds: string | null;
}

function calculateAge(dob: string): string {
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
    years--;
  }
  return `${years}y`;
}

export function MedicalAlertsReport({ serviceId }: { serviceId: string }) {
  const [search, setSearch] = useState("");

  const params = serviceId ? `serviceId=${serviceId}` : "";

  const { data, isLoading } = useQuery<MedicalChild[]>({
    queryKey: ["report-medical-alerts", serviceId],
    queryFn: () => fetchApi(`/api/reports/medical-alerts?${params}`),
    retry: 2,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(
      (c) =>
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.medicalConditions.some((m) => m.toLowerCase().includes(q)),
    );
  }, [data, search]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 print-only-table">
      {/* Header note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          This report lists all currently enrolled children with medical conditions, dietary requirements,
          or medication needs. Keep this accessible for emergency reference.
        </p>
      </div>

      {/* Search + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search by name or condition..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-white"
          />
        </div>

        <a
          href={`/api/reports/medical-alerts/export?${params}`}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#004E64] text-white rounded-lg hover:bg-[#003d50] transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </a>

        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-surface transition-colors"
        >
          <Printer className="w-4 h-4" />
          Print
        </button>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface border-b border-border">
                <th className="text-left px-4 py-2.5 font-medium text-muted">Child Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted">Age</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted">Service</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted">Medical Conditions</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted">Dietary</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted">Anaphylaxis</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted">Medication</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted">
                    No children with medical alerts found.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="border-b border-border hover:bg-surface/50">
                    <td className="px-4 py-2.5 text-foreground font-medium">
                      {c.firstName} {c.lastName}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{calculateAge(c.dateOfBirth)}</td>
                    <td className="px-4 py-2.5 text-muted">{c.serviceName}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {c.medicalConditions.map((m) => (
                          <span key={m} className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            {m}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted text-xs">
                      {c.dietaryRequirements.join(", ") || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {c.anaphylaxisActionPlan ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                          <AlertTriangle className="w-3 h-3" />
                          YES
                        </span>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {c.medicationDetails ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                          <Pill className="w-3 h-3" />
                          YES
                        </span>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted">
        Showing {filtered.length} of {data?.length ?? 0} children with medical alerts.
      </p>
    </div>
  );
}

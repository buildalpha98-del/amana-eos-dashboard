"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Handshake, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SchoolHealthEntry {
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  healthScore: number;
  contractEndDate: string | null;
  lastPrincipalVisit: string | null;
  buildAlphaKidsActive: boolean;
  schoolPrincipalName: string | null;
}

const TOOLTIP_MAP: Record<string, string> = {
  BAK: "Build Alpha Kids — after-school enrichment program",
};

function Tip({ abbr }: { abbr: string }) {
  const full = TOOLTIP_MAP[abbr];
  if (!full) return <>{abbr}</>;
  return (
    <span title={full} className="cursor-help underline decoration-dotted decoration-gray-400 underline-offset-2">
      {abbr}
    </span>
  );
}

export function DashboardSchoolHealth() {
  const { data, isLoading } = useQuery<{ schools: SchoolHealthEntry[] }>({
    queryKey: ["school-health"],
    queryFn: async () => {
      const res = await fetch("/api/partnerships/school-health");
      if (!res.ok) throw new Error("Failed to fetch school health");
      return res.json();
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Handshake className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-semibold text-gray-700">School Relationship Health</h3>
        </div>
        <div className="flex items-center justify-center py-6 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  const schools = data?.schools || [];
  if (schools.length === 0) return null;

  // Show only the 6 weakest schools (lowest scores first — already sorted by API)
  const weak = schools.slice(0, 6);
  const avgScore = Math.round(schools.reduce((s, x) => s + x.healthScore, 0) / schools.length);
  const atRisk = schools.filter((s) => s.healthScore < 40).length;

  const scoreColor = (score: number) =>
    score >= 70
      ? "text-emerald-700 bg-emerald-50"
      : score >= 40
        ? "text-amber-700 bg-amber-50"
        : "text-red-700 bg-red-50";

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Handshake className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-semibold text-gray-700">School Relationship Health</h3>
        </div>
        <Link
          href="/crm"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-hover transition-colors"
        >
          View all <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Summary strip */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 text-xs font-medium text-gray-600">
          Avg: <span className={cn("font-bold", avgScore >= 70 ? "text-emerald-600" : avgScore >= 40 ? "text-amber-600" : "text-red-600")}>{avgScore}</span>
        </div>
        {atRisk > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-xs font-medium text-red-700">
            {atRisk} at risk
          </div>
        )}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 text-xs font-medium text-gray-600">
          {schools.length} schools
        </div>
      </div>

      {/* Cards — mobile-friendly grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {weak.map((s) => {
          const daysSinceVisit = s.lastPrincipalVisit
            ? Math.floor((Date.now() - new Date(s.lastPrincipalVisit).getTime()) / (1000 * 60 * 60 * 24))
            : null;
          const contractDays = s.contractEndDate
            ? Math.ceil((new Date(s.contractEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null;

          return (
            <Link
              key={s.serviceId}
              href={`/services/${s.serviceId}`}
              className="block border border-gray-100 rounded-lg p-3 hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{s.serviceName}</p>
                  <p className="text-[10px] text-gray-400">{s.serviceCode}</p>
                </div>
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ml-2", scoreColor(s.healthScore))}>
                  {s.healthScore}
                </span>
              </div>
              <div className="space-y-1 text-[11px] text-gray-500">
                <div className="flex justify-between">
                  <span>Last visit</span>
                  <span className={cn("font-medium", daysSinceVisit && daysSinceVisit > 90 ? "text-red-600" : "text-gray-700")}>
                    {daysSinceVisit !== null ? `${daysSinceVisit}d ago` : "No visit"}
                  </span>
                </div>
                {contractDays !== null && (
                  <div className="flex justify-between">
                    <span>Contract</span>
                    <span className={cn("font-medium", contractDays <= 90 ? "text-red-600" : contractDays <= 180 ? "text-amber-600" : "text-gray-700")}>
                      {contractDays <= 0 ? "Expired" : `${contractDays}d left`}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span><Tip abbr="BAK" /></span>
                  <span className={cn("font-medium", s.buildAlphaKidsActive ? "text-emerald-600" : "text-gray-400")}>
                    {s.buildAlphaKidsActive ? "Active" : "No"}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

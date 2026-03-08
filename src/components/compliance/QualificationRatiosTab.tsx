"use client";

import { useQualificationRatios, type QualificationRatioData } from "@/hooks/useAudits";
import { cn } from "@/lib/utils";
import {
  GraduationCap,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Users,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function percentBar(percent: number, threshold?: number) {
  const isBelow = threshold != null && percent < threshold;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isBelow ? "bg-red-500" : percent >= 80 ? "bg-emerald-500" : percent >= 50 ? "bg-amber-500" : "bg-red-500"
          )}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <span className={cn("text-xs font-medium w-10 text-right", isBelow ? "text-red-600" : "text-gray-600")}>
        {percent.toFixed(0)}%
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function QualificationRatiosTab() {
  const { data, isLoading } = useQualificationRatios();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-[#004E64] animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-sm">No qualification data available</p>
      </div>
    );
  }

  const { centres, network } = data;

  return (
    <div className="space-y-6">
      {/* Network summary */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-[#004E64]" />
          Network Summary
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{network.totalStaff}</div>
            <div className="text-xs text-gray-500">Total Staff</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-[#004E64]">{network.diplomaPlusPercent.toFixed(0)}%</div>
            <div className="text-xs text-gray-500">Diploma+ Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {network.compliantCentres}/{network.totalCentres}
            </div>
            <div className="text-xs text-gray-500">50% Rule Compliant</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{network.wwccCount}</div>
            <div className="text-xs text-gray-500">WWCC Holders</div>
          </div>
        </div>
      </div>

      {/* Per-centre breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-[#004E64]" />
            Qualification Ratios by Centre
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Centre</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">Staff</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">Cert III</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">Diploma+</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">Diploma+ %</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">WWCC</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">First Aid</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">50% Rule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {centres.map((centre) => (
                <tr key={centre.service.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{centre.service.name}</p>
                    <p className="text-xs text-gray-500">{centre.service.code}</p>
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-gray-900">
                    {centre.totalStaff}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {centre.certIIICount}
                    <span className="text-xs text-gray-400 ml-1">({centre.certIIIPercent.toFixed(0)}%)</span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {centre.diplomaPlusCount}
                  </td>
                  <td className="px-4 py-3 min-w-[140px]">
                    {percentBar(centre.diplomaPlusPercent, 50)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      "text-xs font-medium",
                      centre.wwccPercent >= 100 ? "text-emerald-600" : "text-red-600"
                    )}>
                      {centre.wwccCount}/{centre.totalStaff}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      "text-xs font-medium",
                      centre.firstAidPercent >= 100 ? "text-emerald-600" : centre.firstAidPercent >= 80 ? "text-amber-600" : "text-red-600"
                    )}>
                      {centre.firstAidCount}/{centre.totalStaff}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {centre.fiftyPercentCompliant ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        Compliant
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-1 rounded-full">
                        <AlertTriangle className="w-3 h-3" />
                        Non-Compliant
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

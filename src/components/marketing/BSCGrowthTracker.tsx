"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

interface BSCCentre {
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  bscEnrolled: number;
  bscTarget: number;
  weekOnWeekChange: number;
  percentOfTarget: number;
}

interface BSCData {
  centres: BSCCentre[];
  totalEnrolled: number;
  totalTarget: number;
  networkPercentage: number;
}

export function BSCGrowthTracker({ serviceId }: { serviceId?: string }) {
  const [data, setData] = useState<BSCData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (serviceId) params.set("serviceId", serviceId);
    params.set("bscOnly", "true");

    fetch(`/api/marketing/occupancy?${params}`)
      .then((r) => r.json())
      .then((res) => {
        // Extract BSC-specific data from occupancy endpoint
        const centres: BSCCentre[] = (res.centres || []).map((c: any) => ({
          serviceId: c.serviceId,
          serviceName: c.serviceName,
          serviceCode: c.serviceCode,
          bscEnrolled: c.bscEnrolled ?? 0,
          bscTarget: c.bscTarget ?? 0,
          weekOnWeekChange: c.bscTrend ?? 0,
          percentOfTarget: c.bscTarget > 0 ? Math.round((c.bscEnrolled / c.bscTarget) * 100) : 0,
        }));

        const totalEnrolled = centres.reduce((s: number, c: BSCCentre) => s + c.bscEnrolled, 0);
        const totalTarget = centres.reduce((s: number, c: BSCCentre) => s + c.bscTarget, 0);

        setData({
          centres,
          totalEnrolled,
          totalTarget,
          networkPercentage: totalTarget > 0 ? Math.round((totalEnrolled / totalTarget) * 100) : 0,
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [serviceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!data) return null;

  const zeroCentres = data.centres.filter((c) => c.bscEnrolled === 0);

  return (
    <div className="bg-white rounded-xl border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-gray-900">BSC Growth Tracker</h4>
          <p className="text-xs text-gray-500">
            Before School Care — significant growth opportunity
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">
            {data.totalEnrolled}
            <span className="text-sm text-gray-400 font-normal"> / {data.totalTarget}</span>
          </div>
          <div className="text-xs text-gray-500">
            {data.networkPercentage}% of network target
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-3">
        <div
          className="bg-blue-500 h-3 rounded-full transition-all"
          style={{ width: `${Math.min(data.networkPercentage, 100)}%` }}
        />
      </div>

      {/* Zero BSC alert */}
      {zeroCentres.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-700">
            <span className="font-medium">{zeroCentres.length} centres</span> have zero BSC
            enrolments:{" "}
            {zeroCentres.map((c) => c.serviceName).join(", ")}
          </div>
        </div>
      )}

      {/* Centre table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase border-b">
              <th className="text-left py-2">Centre</th>
              <th className="text-right py-2">Enrolled</th>
              <th className="text-right py-2">Target</th>
              <th className="text-right py-2">Progress</th>
              <th className="text-right py-2">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.centres.map((c) => (
              <tr key={c.serviceId} className={c.bscEnrolled === 0 ? "bg-red-50/50" : ""}>
                <td className="py-2 font-medium text-gray-900">{c.serviceName}</td>
                <td className="py-2 text-right text-gray-700">{c.bscEnrolled}</td>
                <td className="py-2 text-right text-gray-500">{c.bscTarget}</td>
                <td className="py-2 text-right">
                  <span
                    className={`text-xs font-medium ${
                      c.percentOfTarget >= 80
                        ? "text-green-600"
                        : c.percentOfTarget >= 40
                        ? "text-amber-600"
                        : "text-red-600"
                    }`}
                  >
                    {c.percentOfTarget}%
                  </span>
                </td>
                <td className="py-2 text-right">
                  {c.weekOnWeekChange > 0 ? (
                    <span className="flex items-center justify-end gap-0.5 text-green-600 text-xs">
                      <TrendingUp className="h-3 w-3" />+{c.weekOnWeekChange}
                    </span>
                  ) : c.weekOnWeekChange < 0 ? (
                    <span className="flex items-center justify-end gap-0.5 text-red-600 text-xs">
                      <TrendingDown className="h-3 w-3" />{c.weekOnWeekChange}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

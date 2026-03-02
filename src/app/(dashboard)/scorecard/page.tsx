"use client";

import { useScorecard } from "@/hooks/useScorecard";
import { ScorecardGrid } from "@/components/scorecard/ScorecardGrid";
import { BarChart3 } from "lucide-react";

export default function ScorecardPage() {
  const { data: scorecard, isLoading, error } = useScorecard();

  return (
    <div className="max-w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Scorecard</h2>
          <p className="text-sm text-gray-500">
            Track your weekly measurables — trailing 13 weeks
          </p>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin w-8 h-8 border-2 border-[#1B4D3E] border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
            <BarChart3 className="w-8 h-8 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            Scorecard not available
          </h3>
          <p className="text-gray-500 mt-2 max-w-md">
            No scorecard has been configured yet. Run the database seed to create
            the default scorecard with measurables.
          </p>
        </div>
      ) : scorecard ? (
        <ScorecardGrid scorecard={scorecard} />
      ) : null}
    </div>
  );
}

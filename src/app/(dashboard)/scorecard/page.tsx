import { BarChart3 } from "lucide-react";

export default function ScorecardPage() {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Scorecard</h2>
          <p className="text-sm text-gray-500">
            Weekly measurables — the numbers that tell you if you&apos;re winning
          </p>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
        <BarChart3 className="w-16 h-16 text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900">
          Scorecard not set up yet
        </h3>
        <p className="text-gray-500 mt-2 max-w-md">
          Track your weekly measurables to keep a pulse on the business. Add
          metrics like enrolments, revenue, and compliance rates.
        </p>
        <p className="text-gray-400 text-sm mt-1">Coming in Phase 2</p>
      </div>
    </div>
  );
}

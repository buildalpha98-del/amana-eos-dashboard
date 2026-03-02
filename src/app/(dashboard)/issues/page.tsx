import { AlertCircle } from "lucide-react";

export default function IssuesPage() {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Issues</h2>
          <p className="text-sm text-gray-500">
            Track and resolve issues using IDS (Identify, Discuss, Solve)
          </p>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
        <AlertCircle className="w-16 h-16 text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900">
          No open issues
        </h3>
        <p className="text-gray-500 mt-2 max-w-md">
          Issues are blockers and problems that need to be identified, discussed,
          and solved. Raise them here to keep the team aligned.
        </p>
        <p className="text-gray-400 text-sm mt-1">Coming in Phase 2</p>
      </div>
    </div>
  );
}

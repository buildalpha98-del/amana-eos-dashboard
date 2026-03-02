import { Users } from "lucide-react";

export default function TeamPage() {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Team</h2>
          <p className="text-sm text-gray-500">
            Your leadership team and accountability chart
          </p>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
        <Users className="w-16 h-16 text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900">
          Team page coming soon
        </h3>
        <p className="text-gray-500 mt-2 max-w-md">
          View team members, their Rocks, To-Dos, and accountability chart. Each
          person gets their own personal dashboard.
        </p>
        <p className="text-gray-400 text-sm mt-1">Coming in a future phase</p>
      </div>
    </div>
  );
}

import { Presentation } from "lucide-react";

export default function MeetingsPage() {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            L10 Meetings
          </h2>
          <p className="text-sm text-gray-500">
            Run your weekly Level 10 leadership meetings
          </p>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
        <Presentation className="w-16 h-16 text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900">
          Meetings module coming soon
        </h3>
        <p className="text-gray-500 mt-2 max-w-md">
          The L10 Meeting page will pull together your Scorecard, Rocks, To-Dos,
          and Issues into a structured agenda with timers and ratings.
        </p>
        <p className="text-gray-400 text-sm mt-1">Coming in a future phase</p>
      </div>
    </div>
  );
}

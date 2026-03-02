import { Eye } from "lucide-react";

export default function VisionPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Eye className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900">Vision / V-TO</h2>
        <p className="text-gray-500 mt-2 max-w-md">
          Your strategic vision document will live here. Core Values, 10-Year
          Target, 3-Year Picture, and 1-Year Goals — all in one place.
        </p>
        <p className="text-gray-400 text-sm mt-1">Coming in Phase 2</p>
      </div>
    </div>
  );
}

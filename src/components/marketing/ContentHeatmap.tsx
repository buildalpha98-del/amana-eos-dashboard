"use client";

import { cn } from "@/lib/utils";

interface ContentHeatmapProps {
  data: Array<{
    serviceId: string;
    serviceName: string;
    serviceCode: string;
    weeks: Array<{ weekStart: string; postCount: number }>;
  }>;
  onCentreClick?: (serviceId: string) => void;
}

function formatWeekLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDate().toString().padStart(2, "0");
  const month = d.toLocaleString("en-AU", { month: "short" });
  return `${day} ${month}`;
}

function getCellClasses(count: number): string {
  if (count === 0) {
    return "bg-red-50 text-red-400";
  }
  if (count <= 2) {
    return "bg-amber-50 text-amber-700";
  }
  return "bg-emerald-50 text-emerald-700";
}

export function ContentHeatmap({ data, onCentreClick }: ContentHeatmapProps) {
  // Sort centres alphabetically by name
  const sorted = [...data].sort((a, b) =>
    a.serviceName.localeCompare(b.serviceName)
  );

  // Determine the week columns from the first centre's data (all centres share the same weeks)
  const weekColumns = sorted[0]?.weeks ?? [];

  if (sorted.length === 0 || weekColumns.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-4">
        No heatmap data available
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Scrollable table container */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50">
              {/* Sticky first column header */}
              <th
                className={cn(
                  "sticky left-0 z-10 bg-gray-50 px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500",
                  "border-b border-r border-gray-200 min-w-[160px]"
                )}
              >
                Centre
              </th>
              {weekColumns.map((week) => (
                <th
                  key={week.weekStart}
                  className="w-16 border-b border-gray-200 px-1 py-2 text-center text-xs font-medium text-gray-500"
                >
                  {formatWeekLabel(week.weekStart)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((centre) => (
              <tr
                key={centre.serviceId}
                onClick={() => onCentreClick?.(centre.serviceId)}
                className={cn(
                  "transition-colors",
                  onCentreClick && "cursor-pointer hover:bg-gray-50"
                )}
              >
                {/* Sticky centre name column */}
                <td
                  className={cn(
                    "sticky left-0 z-10 bg-white px-4 py-2",
                    "border-r border-gray-200"
                  )}
                >
                  <div className="font-medium text-gray-900 text-sm leading-tight">
                    {centre.serviceName}
                  </div>
                  <div className="text-xs text-gray-400">
                    {centre.serviceCode}
                  </div>
                </td>
                {centre.weeks.map((week) => (
                  <td
                    key={week.weekStart}
                    className="px-1 py-1 text-center"
                  >
                    <div
                      className={cn(
                        "mx-auto flex h-10 w-16 items-center justify-center rounded text-sm font-semibold",
                        getCellClasses(week.postCount)
                      )}
                    >
                      {week.postCount}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Colour legend */}
      <div className="flex items-center gap-5 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-red-200" />
          0 posts
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-amber-300" />
          1-2 posts
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-emerald-400" />
          3+ posts
        </div>
      </div>
    </div>
  );
}

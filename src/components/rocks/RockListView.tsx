"use client";

import { useState } from "react";
import type { RockData } from "@/hooks/useRocks";
import { cn } from "@/lib/utils";
import { ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";

const statusConfig = {
  on_track: { label: "On Track", bg: "bg-emerald-50", text: "text-emerald-700" },
  off_track: { label: "Off Track", bg: "bg-red-50", text: "text-red-700" },
  complete: { label: "Complete", bg: "bg-brand/10", text: "text-brand" },
  dropped: { label: "Dropped", bg: "bg-gray-100", text: "text-gray-500" },
};

const priorityConfig = {
  critical: { label: "Critical", text: "text-red-700" },
  high: { label: "High", text: "text-amber-700" },
  medium: { label: "Medium", text: "text-blue-700" },
};

type SortField = "title" | "owner" | "priority" | "percentComplete" | "status";

export function RockListView({
  rocks,
  onRockClick,
}: {
  rocks: RockData[];
  onRockClick: (rock: RockData) => void;
}) {
  const [sortField, setSortField] = useState<SortField>("priority");
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const priorityOrder = { critical: 0, high: 1, medium: 2 };

  const sorted = [...rocks].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "title":
        cmp = a.title.localeCompare(b.title);
        break;
      case "owner":
        cmp = (a.owner?.name ?? "").localeCompare(b.owner?.name ?? "");
        break;
      case "priority":
        cmp = priorityOrder[a.priority] - priorityOrder[b.priority];
        break;
      case "percentComplete":
        cmp = a.percentComplete - b.percentComplete;
        break;
      case "status":
        cmp = a.status.localeCompare(b.status);
        break;
    }
    return sortAsc ? cmp : -cmp;
  });

  const SortHeader = ({
    field,
    children,
  }: {
    field: SortField;
    children: React.ReactNode;
  }) => (
    <th
      className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortField === field ? (
          sortAsc ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead className="bg-surface border-b border-gray-200">
          <tr>
            <SortHeader field="title">Title</SortHeader>
            <SortHeader field="owner">Owner</SortHeader>
            <SortHeader field="priority">Priority</SortHeader>
            <SortHeader field="status">Status</SortHeader>
            <SortHeader field="percentComplete">Progress</SortHeader>
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Linked Goal
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((rock) => {
            const status = statusConfig[rock.status];
            const priority = priorityConfig[rock.priority];
            return (
              <tr
                key={rock.id}
                onClick={() => onRockClick(rock)}
                className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="py-3 px-4">
                  <span className="text-sm font-medium text-gray-900">
                    {rock.title}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand/10 flex items-center justify-center">
                      <span className="text-[10px] font-medium text-brand">
                        {(rock.owner?.name ?? "Unassigned")
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)}
                      </span>
                    </div>
                    <span className="text-sm text-gray-600">
                      {rock.owner?.name ?? "Unassigned"}
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span className={cn("text-xs font-semibold", priority.text)}>
                    {priority.label}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span
                    className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                      status.bg,
                      status.text
                    )}
                  >
                    {status.label}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${rock.percentComplete}%`,
                          backgroundColor:
                            rock.status === "on_track"
                              ? "#10B981"
                              : rock.status === "complete"
                              ? "#004E64"
                              : "#EF4444",
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-600 w-8 text-right">
                      {rock.percentComplete}%
                    </span>
                  </div>
                </td>
                <td className="py-3 px-4">
                  {rock.oneYearGoal ? (
                    <span className="text-xs text-brand bg-brand/5 px-2 py-0.5 rounded">
                      {rock.oneYearGoal.title}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

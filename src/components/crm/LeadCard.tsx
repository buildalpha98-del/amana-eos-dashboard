"use client";

import type { LeadSummary } from "@/hooks/useCRM";

const sourceColors: Record<string, string> = {
  tender: "bg-blue-100 text-blue-700",
  direct: "bg-emerald-100 text-emerald-700",
};

export function LeadCard({
  lead,
  onClick,
  isDragging,
}: {
  lead: LeadSummary;
  onClick: () => void;
  isDragging?: boolean;
}) {
  const daysInStage = Math.floor(
    (Date.now() - new Date(lead.stageChangedAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:shadow-md transition-all ${
        isDragging ? "shadow-lg ring-2 ring-[#FECE00] opacity-90" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className="text-sm font-semibold text-gray-900 line-clamp-1">
          {lead.schoolName}
        </h4>
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${
            sourceColors[lead.source] || "bg-gray-100 text-gray-600"
          }`}
        >
          {lead.source}
        </span>
      </div>

      {lead.contactName && (
        <p className="text-xs text-gray-500 mb-1.5 line-clamp-1">
          {lead.contactName}
        </p>
      )}

      <div className="flex items-center justify-between text-[11px] text-gray-400">
        <div className="flex items-center gap-2">
          {lead.state && (
            <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
              {lead.state}
            </span>
          )}
          <span>{daysInStage}d</span>
        </div>

        <div className="flex items-center gap-2">
          {lead._count.touchpoints > 0 && (
            <span className="text-gray-500">
              {lead._count.touchpoints} touch{lead._count.touchpoints !== 1 ? "es" : ""}
            </span>
          )}
          {lead.assignedTo && (
            <div
              className="w-5 h-5 rounded-full bg-[#003344] text-white flex items-center justify-center text-[10px] font-medium"
              title={lead.assignedTo.name}
            >
              {lead.assignedTo.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

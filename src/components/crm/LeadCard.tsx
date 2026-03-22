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
      className={`bg-card rounded-lg border border-border p-3 cursor-pointer hover:shadow-md transition-all ${
        isDragging ? "shadow-lg ring-2 ring-[#FECE00] opacity-90" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h4 className="text-sm font-semibold text-foreground line-clamp-1">
          {lead.schoolName}
        </h4>
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${
            sourceColors[lead.source] || "bg-surface text-muted"
          }`}
        >
          {lead.source}
        </span>
      </div>

      {lead.contactName && (
        <p className="text-xs text-muted mb-1.5 line-clamp-1">
          {lead.contactName}
        </p>
      )}

      <div className="flex items-center justify-between text-[11px] text-muted">
        <div className="flex items-center gap-2">
          {lead.state && (
            <span className="bg-surface text-muted px-1.5 py-0.5 rounded">
              {lead.state}
            </span>
          )}
          {lead.aiScore != null && (
            <span
              className={`font-semibold px-1.5 py-0.5 rounded-full ${
                lead.aiScore >= 70
                  ? "bg-emerald-100 text-emerald-700"
                  : lead.aiScore >= 40
                    ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700"
              }`}
            >
              {lead.aiScore}
            </span>
          )}
          <span>{daysInStage}d</span>
        </div>

        <div className="flex items-center gap-2">
          {lead._count.touchpoints > 0 && (
            <span className="text-muted">
              {lead._count.touchpoints} touch{lead._count.touchpoints !== 1 ? "es" : ""}
            </span>
          )}
          {lead.assignedTo && (
            <div
              className="w-5 h-5 rounded-full bg-brand-dark text-white flex items-center justify-center text-[10px] font-medium"
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

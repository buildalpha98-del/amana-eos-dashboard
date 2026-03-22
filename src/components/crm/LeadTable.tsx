"use client";

import type { LeadSummary } from "@/hooks/useCRM";
import { StickyTable } from "@/components/ui/StickyTable";

const stageLabels: Record<string, string> = {
  new_lead: "New Lead",
  reviewing: "Reviewing",
  contact_made: "Contact Made",
  follow_up_1: "Follow-up 1",
  follow_up_2: "Follow-up 2",
  meeting_booked: "Meeting Booked",
  proposal_sent: "Proposal Sent",
  submitted: "Submitted",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
  on_hold: "On Hold",
};

const stageColors: Record<string, string> = {
  new_lead: "bg-indigo-100 text-indigo-700",
  reviewing: "bg-purple-100 text-purple-700",
  contact_made: "bg-blue-100 text-blue-700",
  follow_up_1: "bg-sky-100 text-sky-700",
  follow_up_2: "bg-cyan-100 text-cyan-700",
  meeting_booked: "bg-teal-100 text-teal-700",
  proposal_sent: "bg-amber-100 text-amber-700",
  submitted: "bg-orange-100 text-orange-700",
  negotiating: "bg-red-100 text-red-700",
  won: "bg-emerald-100 text-emerald-700",
  lost: "bg-gray-100 text-gray-600",
  on_hold: "bg-gray-100 text-gray-500",
};

export function LeadTable({
  leads,
  onLeadClick,
}: {
  leads: LeadSummary[];
  onLeadClick: (lead: LeadSummary) => void;
}) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <StickyTable>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface/50">
            <th className="text-left px-4 py-3 font-medium text-muted">School</th>
            <th className="text-left px-4 py-3 font-medium text-muted hidden sm:table-cell">Contact</th>
            <th className="text-left px-4 py-3 font-medium text-muted hidden md:table-cell">State</th>
            <th className="text-left px-4 py-3 font-medium text-muted hidden md:table-cell">Source</th>
            <th className="text-left px-4 py-3 font-medium text-muted">Stage</th>
            <th className="text-left px-4 py-3 font-medium text-muted hidden lg:table-cell">Assignee</th>
            <th className="text-left px-4 py-3 font-medium text-muted">Score</th>
            <th className="text-left px-4 py-3 font-medium text-muted hidden sm:table-cell">Days</th>
            <th className="text-left px-4 py-3 font-medium text-muted hidden lg:table-cell">Touchpoints</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const daysInStage = Math.floor(
              (Date.now() - new Date(lead.stageChangedAt).getTime()) / (1000 * 60 * 60 * 24)
            );
            return (
              <tr
                key={lead.id}
                onClick={() => onLeadClick(lead)}
                className="border-b border-border/50 hover:bg-surface cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">
                  {lead.schoolName}
                </td>
                <td className="px-4 py-3 text-muted hidden sm:table-cell">
                  {lead.contactName || "—"}
                </td>
                <td className="px-4 py-3 text-muted hidden md:table-cell">
                  {lead.state || "—"}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      lead.source === "tender"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {lead.source}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      stageColors[lead.pipelineStage] || "bg-surface text-muted"
                    }`}
                  >
                    {stageLabels[lead.pipelineStage] || lead.pipelineStage}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted hidden lg:table-cell">
                  {lead.assignedTo?.name || "—"}
                </td>
                <td className="px-4 py-3">
                  {lead.aiScore != null ? (
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        lead.aiScore >= 70
                          ? "bg-emerald-100 text-emerald-700"
                          : lead.aiScore >= 40
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {lead.aiScore}
                    </span>
                  ) : (
                    <span className="text-xs text-muted/50">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted hidden sm:table-cell">{daysInStage}d</td>
                <td className="px-4 py-3 text-muted hidden lg:table-cell">
                  {lead._count.touchpoints}
                </td>
              </tr>
            );
          })}
          {leads.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-12 text-center text-muted sm:table-cell">
                No leads found
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </StickyTable>
    </div>
  );
}

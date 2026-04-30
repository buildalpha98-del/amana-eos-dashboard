"use client";

import { ArrowRight } from "lucide-react";
import type { MeetingData } from "@/hooks/useMeetings";
import type { RockData } from "@/hooks/useRocks";
import type { TodoData } from "@/hooks/useTodos";
import type { IssueData } from "@/hooks/useIssues";

export function MeetingOutcomesPanel({
  meeting,
  rocks,
  todos,
  issues,
}: {
  meeting: MeetingData;
  rocks: RockData[] | undefined;
  todos: TodoData[] | undefined;
  issues: IssueData[] | undefined;
}) {
  const todosDone = todos?.filter((t) => t.status === "complete").length ?? 0;
  const todosTotal = todos?.length ?? 0;
  const rocksOnTrack = rocks?.filter(
    (r) => r.status === "on_track" || r.status === "complete"
  ).length ?? 0;
  const rocksTotal = rocks?.length ?? 0;
  const solvedIssues = issues?.filter((i) => i.status === "solved" || i.status === "closed").length ?? 0;
  const cascadeLines = meeting.cascadeMessages
    ? meeting.cascadeMessages.split("\n").filter((l) => l.trim())
    : [];

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border/50 bg-emerald-50/50">
        <h3 className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
          Meeting Outcomes
        </h3>
      </div>
      <div className="p-4 space-y-4">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-2 bg-surface/50 rounded-lg">
            <p className="text-lg font-bold text-foreground">{todosDone}/{todosTotal}</p>
            <p className="text-[10px] text-muted uppercase">To-Dos Done</p>
          </div>
          <div className="text-center p-2 bg-surface/50 rounded-lg">
            <p className="text-lg font-bold text-foreground">{rocksOnTrack}/{rocksTotal}</p>
            <p className="text-[10px] text-muted uppercase">Rocks On Track</p>
          </div>
          <div className="text-center p-2 bg-surface/50 rounded-lg">
            <p className="text-lg font-bold text-foreground">{solvedIssues}</p>
            <p className="text-[10px] text-muted uppercase">Issues Solved</p>
          </div>
          <div className="text-center p-2 bg-surface/50 rounded-lg">
            <p className="text-lg font-bold text-accent">{meeting.rating ?? "—"}<span className="text-xs text-muted">/10</span></p>
            <p className="text-[10px] text-muted uppercase">Rating</p>
          </div>
        </div>

        {/* Conclude Notes */}
        {meeting.concludeNotes && (
          <div>
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">Recap</p>
            <p className="text-xs text-muted whitespace-pre-wrap">{meeting.concludeNotes}</p>
          </div>
        )}

        {/* Cascade Messages */}
        {cascadeLines.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-brand uppercase tracking-wider mb-1">
              Cascade Messages
            </p>
            <div className="space-y-1">
              {cascadeLines.map((line, i) => (
                <div key={i} className="flex items-start gap-2">
                  <ArrowRight className="w-3 h-3 text-brand mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-foreground/80">{line.replace(/^[-•*]\s*/, "")}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

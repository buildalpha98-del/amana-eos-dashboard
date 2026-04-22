"use client";

import { useState, useMemo } from "react";
import {
  Presentation,
  Play,
  Star,
  ChevronRight,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Timer,
  Calendar,
  Search,
  History,
  X,
} from "lucide-react";
import { useTodos } from "@/hooks/useTodos";
import { useRocks } from "@/hooks/useRocks";
import { useScorecard } from "@/hooks/useScorecard";
import { useIssues } from "@/hooks/useIssues";
import type { MeetingData } from "@/hooks/useMeetings";
import { cn, formatDateAU, getWeekStart, getCurrentQuarter } from "@/lib/utils";
import { AiButton } from "@/components/ui/AiButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { L10_SECTIONS } from "./sections";

export function MeetingListView({
  meetings,
  onStartNew,
  onSelect,
}: {
  meetings: MeetingData[];
  onStartNew: () => void;
  onSelect: (m: MeetingData) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "cancelled">("all");
  const [visibleCount, setVisibleCount] = useState(10);
  const [aiPrep, setAiPrep] = useState("");

  const activeMeeting = meetings.find((m) => m.status === "in_progress");

  // Data hooks for AI Prep variables
  const weekStart = getWeekStart();
  const { data: allTodos } = useTodos({ weekOf: weekStart.toISOString() });
  const { data: allRocks } = useRocks(getCurrentQuarter());
  const { data: scorecard } = useScorecard();
  const { data: allIssues } = useIssues({ status: "open,in_discussion" });

  // Format AI Prep variables
  const aiPrepVariables = useMemo(() => {
    const overdueTodos = (allTodos ?? [])
      .filter((t) => t.status !== "complete" && new Date(t.dueDate) < new Date())
      .map((t) => `- ${t.title} (due ${formatDateAU(new Date(t.dueDate))}, assigned to ${t.assignee?.name ?? "unassigned"})`)
      .join("\n") || "None";

    const offTrackRocks = (allRocks ?? [])
      .filter((r) => r.status === "off_track")
      .map((r) => `- ${r.title} (${r.status.replace(/_/g, " ")}, ${r.percentComplete}% complete, owner: ${r.owner?.name ?? "unassigned"})`)
      .join("\n") || "None";

    const scorecardMisses = (scorecard?.measurables ?? [])
      .filter((m) => {
        const latest = m.entries?.[0];
        if (!latest) return true; // no entry = miss
        return !latest.onTrack;
      })
      .map((m) => {
        const latest = m.entries?.[0];
        const val = latest ? `${latest.value}` : "no entry";
        return `- ${m.title}: ${val} (goal: ${m.goalDirection === "above" ? "≥" : m.goalDirection === "below" ? "≤" : "="} ${m.goalValue}${m.unit ? ` ${m.unit}` : ""})`;
      })
      .join("\n") || "None";

    const openIssues = (allIssues ?? [])
      .slice(0, 15)
      .map((i) => `- ${i.title} (priority: ${i.priority}, raised by ${i.raisedBy?.name ?? "unknown"})`)
      .join("\n") || "None";

    const completedMeetings = meetings.filter((m) => m.status === "completed");
    const lastMeeting = completedMeetings[0];
    const recentUpdates = [
      `Total meetings completed: ${completedMeetings.length}`,
      lastMeeting ? `Last meeting: ${formatDateAU(new Date(lastMeeting.date))}${lastMeeting.rating ? ` (rated ${lastMeeting.rating}/10)` : ""}` : null,
      `Current quarter rocks: ${(allRocks ?? []).length} total, ${(allRocks ?? []).filter((r) => r.status === "complete").length} complete`,
      `Open todos this week: ${(allTodos ?? []).filter((t) => t.status !== "complete").length}`,
    ].filter(Boolean).join("\n");

    return { overdueTodos, offTrackRocks, scorecardMisses, openIssues, recentUpdates };
  }, [allTodos, allRocks, scorecard, allIssues, meetings]);

  // Stats from completed meetings
  const stats = useMemo(() => {
    const completed = meetings.filter((m) => m.status === "completed");
    const rated = completed.filter((m) => m.rating !== null);
    const avgRating = rated.length > 0
      ? Math.round((rated.reduce((sum, m) => sum + (m.rating || 0), 0) / rated.length) * 10) / 10
      : null;

    // Streak: consecutive weeks with a completed meeting (newest first)
    let streak = 0;
    if (completed.length > 0) {
      const sortedDates = completed
        .map((m) => getWeekStart(new Date(m.date)).getTime())
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .sort((a, b) => b - a);

      const thisWeek = getWeekStart().getTime();
      let expected = thisWeek;
      for (const d of sortedDates) {
        if (d === expected || d === expected - 7 * 86400000) {
          streak++;
          expected = d - 7 * 86400000;
        } else if (d < expected) {
          break;
        }
      }
    }

    return { total: completed.length, avgRating, streak };
  }, [meetings]);

  // Filtered meetings (exclude in_progress from history list)
  const pastMeetings = useMemo(() => {
    let filtered = meetings.filter((m) => m.status !== "in_progress");
    if (statusFilter !== "all") {
      filtered = filtered.filter((m) => m.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          (m.createdBy?.name ?? "").toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [meetings, statusFilter, searchQuery]);

  const visibleMeetings = pastMeetings.slice(0, visibleCount);
  const hasMore = visibleCount < pastMeetings.length;

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="L10 Meetings"
        description="Run your weekly Level 10 leadership meetings"
        helpTooltipId="l10-heading"
        helpTooltipContent="The Level 10 Meeting is a weekly 90-minute meeting that keeps your team aligned. Follow the agenda: Segue, Scorecard, Rock Review, To-Do Review, IDS, Conclude."
        primaryAction={{
          label: "Start New Meeting",
          icon: Play,
          onClick: onStartNew,
        }}
      >
        <AiButton
          templateSlug="meetings/l10-prep"
          variables={aiPrepVariables}
          onResult={(text) => setAiPrep(text)}
          label="AI Prep"
          size="sm"
          section="meetings"
        />
      </PageHeader>

      {/* AI Meeting Prep */}
      {aiPrep && (
        <div className="mb-6 rounded-xl border border-purple-200 bg-purple-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 text-sm text-purple-900 whitespace-pre-wrap">{aiPrep}</div>
            <button onClick={() => setAiPrep("")} className="text-purple-400 hover:text-purple-600 flex-shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Active Meeting Banner */}
      {activeMeeting && (
        <button
          onClick={() => onSelect(activeMeeting)}
          className="w-full mb-6 p-4 bg-brand/5 border-2 border-brand rounded-xl flex items-center gap-4 text-left hover:bg-brand/10 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-brand flex items-center justify-center">
            <Presentation className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-brand">
              Meeting In Progress
            </p>
            <p className="text-xs text-muted truncate">
              {activeMeeting.title} &mdash; Section{" "}
              {activeMeeting.currentSection + 1} of 7:{" "}
              {L10_SECTIONS[activeMeeting.currentSection]?.label}
            </p>
          </div>
          <div className="flex items-center gap-2 text-brand">
            <span className="text-sm font-medium">Resume</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </button>
      )}

      {/* Stats Cards */}
      {stats.total > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-card rounded-xl border border-border p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{stats.total}</div>
            <div className="text-xs text-muted mt-0.5">Meetings Completed</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <Star className="w-5 h-5 text-accent fill-accent" />
              <span className="text-2xl font-bold text-foreground">
                {stats.avgRating ?? "—"}
              </span>
            </div>
            <div className="text-xs text-muted mt-0.5">Avg Rating</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4 text-center">
            <div className="text-2xl font-bold text-brand">{stats.streak}</div>
            <div className="text-xs text-muted mt-0.5">Week Streak</div>
          </div>
        </div>
      )}

      {/* Past Meetings */}
      {meetings.length > 0 ? (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {/* History header with search + filter */}
          <div className="px-4 py-3 border-b border-border/50 bg-surface/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-muted" />
                <h3 className="text-sm font-medium text-foreground/80">
                  Meeting History
                </h3>
                <span className="text-xs text-muted">
                  ({pastMeetings.length})
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setVisibleCount(10);
                  }}
                  placeholder="Search meetings..."
                  aria-label="Search meetings"
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                />
              </div>
              {/* Status filter */}
              <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5">
                {(["all", "completed", "cancelled"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      setStatusFilter(f);
                      setVisibleCount(10);
                    }}
                    className={cn(
                      "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                      statusFilter === f
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted hover:text-foreground"
                    )}
                  >
                    {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* List */}
          {visibleMeetings.length > 0 ? (
            <div className="divide-y divide-border/50">
              {visibleMeetings.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => onSelect(meeting)}
                  className="w-full px-4 py-3 flex items-center gap-4 text-left hover:bg-surface transition-colors"
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center",
                      meeting.status === "completed"
                        ? "bg-emerald-50"
                        : meeting.status === "in_progress"
                        ? "bg-brand/10"
                        : "bg-surface"
                    )}
                  >
                    {meeting.status === "completed" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : meeting.status === "in_progress" ? (
                      <Timer className="w-4 h-4 text-brand" />
                    ) : meeting.status === "cancelled" ? (
                      <XCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <Calendar className="w-4 h-4 text-muted" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {meeting.title}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateAU(meeting.date)} &middot;{" "}
                      {meeting.createdBy?.name ?? "Unknown"}
                      {meeting.completedAt && (
                        <>
                          {" "}&middot;{" "}
                          {(() => {
                            const start = new Date(meeting.startedAt || meeting.createdAt);
                            const end = new Date(meeting.completedAt);
                            const mins = Math.round(
                              (end.getTime() - start.getTime()) / 60000
                            );
                            return `${mins}m`;
                          })()}
                        </>
                      )}
                    </p>
                  </div>
                  {meeting.rating && (
                    <div className="flex items-center gap-1">
                      <Star
                        className={cn(
                          "w-3.5 h-3.5",
                          meeting.rating >= 8
                            ? "text-accent fill-accent"
                            : meeting.rating >= 5
                            ? "text-amber-400 fill-amber-400"
                            : "text-muted/50 fill-muted/30"
                        )}
                      />
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          meeting.rating >= 8
                            ? "text-brand"
                            : meeting.rating >= 5
                            ? "text-amber-600"
                            : "text-muted"
                        )}
                      >
                        {meeting.rating}
                      </span>
                    </div>
                  )}
                  <div
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      meeting.status === "completed"
                        ? "bg-emerald-50 text-emerald-700"
                        : meeting.status === "in_progress"
                        ? "bg-brand/10 text-brand"
                        : meeting.status === "cancelled"
                        ? "bg-red-50 text-red-600"
                        : "bg-surface text-muted"
                    )}
                  >
                    {meeting.status === "in_progress"
                      ? "In Progress"
                      : meeting.status.charAt(0).toUpperCase() +
                        meeting.status.slice(1)}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted/50" />
                </button>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted">
              No meetings match your filters
            </div>
          )}

          {/* Load more */}
          {hasMore && (
            <div className="px-4 py-3 border-t border-border/50 bg-surface/30 text-center">
              <button
                onClick={() => setVisibleCount((c) => c + 10)}
                className="text-sm text-brand font-medium hover:underline"
              >
                Show more ({pastMeetings.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-card rounded-xl border border-border">
          <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
            <Presentation className="w-8 h-8 text-brand" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            No meetings yet
          </h3>
          <p className="text-muted mt-2 max-w-md">
            L10 Meetings bring together your Scorecard, Rocks, To-Dos, and Issues
            into a structured 90-minute agenda. Start your first one now.
          </p>
          <button
            onClick={onStartNew}
            className="mt-6 inline-flex items-center gap-1.5 px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors shadow-sm"
          >
            <Play className="w-4 h-4" />
            Start Your First L10 Meeting
          </button>
        </div>
      )}
    </div>
  );
}

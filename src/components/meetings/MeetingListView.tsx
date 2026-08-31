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
} from "lucide-react";
import type { MeetingData } from "@/hooks/useMeetings";
import {
  useDeleteMeeting,
  usePrepareMeeting,
  useStartMeeting,
  useUpdateMeeting,
} from "@/hooks/useMeetings";
import { toast } from "@/hooks/useToast";
import { useSession } from "next-auth/react";
import { Trash2 } from "lucide-react";
import { cn, formatDateAU, getWeekStart } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { L10_SECTIONS } from "./sections";

/**
 * 2026-07-28: owner/admin can delete a meeting from the list — for
 * cleaning up one started by mistake. Mirrors the API's role gate; the
 * server enforces it regardless of what the UI shows.
 */
export function MeetingListView({
  meetings,
  onStartNew,
  onSelect,
}: {
  meetings: MeetingData[];
  onStartNew: () => void;
  onSelect: (m: MeetingData) => void;
}) {
  const { data: session } = useSession();
  const deleteMeeting = useDeleteMeeting();
  // Mirrors the DELETE route's role gate — the server enforces it too.
  const canDeleteMeetings =
    session?.user?.role === "owner" || session?.user?.role === "admin";

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "cancelled">("all");
  const [visibleCount, setVisibleCount] = useState(10);

  const activeMeeting = meetings.find((m) => m.status === "in_progress");
  const startMeeting = useStartMeeting();
  const updateMeeting = useUpdateMeeting();

  // Upcoming scheduled meetings, soonest first (2026-08-31)
  const upcomingMeetings = useMemo(
    () =>
      meetings
        .filter((m) => m.status === "scheduled")
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [meetings],
  );

  const handleStartScheduled = (meeting: MeetingData) => {
    startMeeting.mutate(meeting.id, {
      onSuccess: (started) => onSelect(started as MeetingData),
    });
  };

  const prepareMeeting = usePrepareMeeting();

  const handleAiPrep = () => {
    const target = activeMeeting ?? upcomingMeetings[0];
    if (!target) {
      toast({
        description:
          "Start or schedule a meeting first — AI Prep briefs a specific meeting.",
      });
      return;
    }
    prepareMeeting.mutate(target.id, {
      onSuccess: () => {
        // Only open the runner for a meeting that's actually running —
        // opening a `scheduled` one here would bypass the guarded start
        // (and let it be completed without ever being started).
        if (target.status === "in_progress") {
          onSelect(target);
        } else {
          toast({
            description: `AI agenda prepared for "${target.title}" — you'll see it when the meeting starts.`,
          });
        }
      },
    });
  };

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

  // Filtered meetings (exclude in_progress + scheduled from history list)
  const pastMeetings = useMemo(() => {
    let filtered = meetings.filter(
      (m) => m.status !== "in_progress" && m.status !== "scheduled",
    );
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
        {/* 2026-08-31: single AI-prep path — generates the PERSISTED
            aiAgendaDraft (rendered by AiAgendaPanel inside the meeting)
            instead of the old ephemeral prose blob. */}
        <Button
          variant="outline"
          size="xs"
          onClick={handleAiPrep}
          loading={prepareMeeting.isPending}
        >
          {prepareMeeting.isPending ? "Preparing…" : "AI Prep"}
        </Button>
      </PageHeader>

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

      {/* Upcoming scheduled meetings (2026-08-31) */}
      {upcomingMeetings.length > 0 && (
        <div className="mb-6 bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border/50 bg-surface/30 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted" />
            <h3 className="text-sm font-medium text-foreground/80">Upcoming</h3>
            <span className="text-xs text-muted">({upcomingMeetings.length})</span>
          </div>
          <div className="divide-y divide-border/50">
            {upcomingMeetings.map((meeting) => (
              <div key={meeting.id} className="px-4 py-3 flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface">
                  <Calendar className="w-4 h-4 text-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {meeting.title}
                  </p>
                  <p className="text-xs text-muted">
                    {new Date(meeting.date).toLocaleString("en-AU", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    &middot; {meeting.createdBy?.name ?? "Unknown"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    if (
                      confirm(
                        `Cancel "${meeting.title}"? It will move to history as cancelled.`,
                      )
                    ) {
                      updateMeeting.mutate({ id: meeting.id, status: "cancelled" });
                    }
                  }}
                  disabled={updateMeeting.isPending}
                >
                  Cancel
                </Button>
                <Button
                  size="xs"
                  onClick={() => handleStartScheduled(meeting)}
                  loading={startMeeting.isPending}
                  iconLeft={<Play className="w-3.5 h-3.5" />}
                >
                  Start
                </Button>
              </div>
            ))}
          </div>
        </div>
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
                <div key={meeting.id} className="relative group">
                <button
                  onClick={() => onSelect(meeting)}
                  className="w-full px-4 py-3 pr-12 flex items-center gap-4 text-left hover:bg-surface transition-colors"
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center",
                      meeting.status === "completed"
                        ? "bg-emerald-50 dark:bg-emerald-950/40"
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
                        ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                        : meeting.status === "in_progress"
                        ? "bg-brand/10 text-brand"
                        : meeting.status === "cancelled"
                        ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400"
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
                {canDeleteMeetings && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        confirm(
                          `Delete "${meeting.title}"? This permanently removes the meeting, its attendees and any cascade messages. Todos, rocks and issues are not affected.`,
                        )
                      ) {
                        deleteMeeting.mutate(meeting.id);
                      }
                    }}
                    disabled={deleteMeeting.isPending}
                    aria-label={`Delete ${meeting.title}`}
                    title="Delete meeting"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-opacity disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                </div>
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

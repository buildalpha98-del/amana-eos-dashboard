"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useMeetings,
  useCreateMeeting,
  useUpdateMeeting,
} from "@/hooks/useMeetings";
import { useScorecard } from "@/hooks/useScorecard";
import { useRocks } from "@/hooks/useRocks";
import { useTodos, useUpdateTodo, useCreateTodo } from "@/hooks/useTodos";
import { useIssues, useUpdateIssue, useCreateIssue } from "@/hooks/useIssues";
import type { MeetingData } from "@/hooks/useMeetings";
import type { RockData } from "@/hooks/useRocks";
import type { TodoData } from "@/hooks/useTodos";
import type { IssueData } from "@/hooks/useIssues";
import type { ScorecardData, MeasurableData } from "@/hooks/useScorecard";
import { useServices } from "@/hooks/useServices";
import type { ServiceSummary } from "@/hooks/useServices";
import { cn, formatDateAU, getWeekStart, getCurrentQuarter } from "@/lib/utils";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  Presentation,
  Play,
  Clock,
  Star,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Mountain,
  ListChecks,
  AlertCircle,
  MessageSquare,
  Lightbulb,
  Users,
  BarChart3,
  Trophy,
  Timer,
  Calendar,
  Pause,
  SkipForward,
  Plus,
  Search,
  History,
  Building2,
  X,
} from "lucide-react";

// ============================================================
// L10 Section Definitions
// ============================================================

interface L10Section {
  key: string;
  label: string;
  duration: number; // minutes
  icon: React.ElementType;
  color: string;
}

const L10_SECTIONS: L10Section[] = [
  { key: "segue", label: "Segue", duration: 5, icon: Users, color: "text-purple-600" },
  { key: "scorecard", label: "Scorecard Review", duration: 5, icon: BarChart3, color: "text-blue-600" },
  { key: "rocks", label: "Rock Review", duration: 5, icon: Mountain, color: "text-emerald-600" },
  { key: "headlines", label: "Headlines", duration: 5, icon: MessageSquare, color: "text-amber-600" },
  { key: "todos", label: "To-Do List", duration: 5, icon: ListChecks, color: "text-indigo-600" },
  { key: "ids", label: "IDS", duration: 60, icon: Lightbulb, color: "text-red-600" },
  { key: "conclude", label: "Conclude", duration: 5, icon: Trophy, color: "text-brand" },
];

// ============================================================
// Timer Hook
// ============================================================

function useTimer(durationMinutes: number) {
  const [totalSeconds, setTotalSeconds] = useState(durationMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isRunning && totalSeconds > 0) {
      intervalRef.current = setInterval(() => {
        setTotalSeconds((prev) => Math.max(0, prev - 1));
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, totalSeconds]);

  const reset = useCallback((minutes: number) => {
    setTotalSeconds(minutes * 60);
    setIsRunning(false);
  }, []);

  const toggle = useCallback(() => setIsRunning((r) => !r), []);

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const isOvertime = totalSeconds === 0 && isRunning;

  return { minutes, seconds, isRunning, isOvertime, toggle, reset, totalSeconds };
}

// ============================================================
// Meeting List View
// ============================================================

function MeetingListView({
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

  const activeMeeting = meetings.find((m) => m.status === "in_progress");

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
          m.createdBy.name.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [meetings, statusFilter, searchQuery]);

  const visibleMeetings = pastMeetings.slice(0, visibleCount);
  const hasMore = visibleCount < pastMeetings.length;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">L10 Meetings</h2>
          <p className="text-sm text-gray-500">
            Run your weekly Level 10 leadership meetings
          </p>
        </div>
        <button
          onClick={onStartNew}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors shadow-sm"
        >
          <Play className="w-4 h-4" />
          Start New Meeting
        </button>
      </div>

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
            <p className="text-xs text-gray-600 truncate">
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
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-xs text-gray-500 mt-0.5">Meetings Completed</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <Star className="w-5 h-5 text-accent fill-accent" />
              <span className="text-2xl font-bold text-gray-900">
                {stats.avgRating ?? "—"}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">Avg Rating</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-brand">{stats.streak}</div>
            <div className="text-xs text-gray-500 mt-0.5">Week Streak</div>
          </div>
        </div>
      )}

      {/* Past Meetings */}
      {meetings.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* History header with search + filter */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-medium text-gray-700">
                  Meeting History
                </h3>
                <span className="text-xs text-gray-400">
                  ({pastMeetings.length})
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setVisibleCount(10);
                  }}
                  placeholder="Search meetings..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                />
              </div>
              {/* Status filter */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
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
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
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
            <div className="divide-y divide-gray-100">
              {visibleMeetings.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => onSelect(meeting)}
                  className="w-full px-4 py-3 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center",
                      meeting.status === "completed"
                        ? "bg-emerald-50"
                        : meeting.status === "in_progress"
                        ? "bg-brand/10"
                        : "bg-gray-100"
                    )}
                  >
                    {meeting.status === "completed" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : meeting.status === "in_progress" ? (
                      <Timer className="w-4 h-4 text-brand" />
                    ) : meeting.status === "cancelled" ? (
                      <XCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <Calendar className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {meeting.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDateAU(meeting.date)} &middot;{" "}
                      {meeting.createdBy.name}
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
                            : "text-gray-300 fill-gray-300"
                        )}
                      />
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          meeting.rating >= 8
                            ? "text-brand"
                            : meeting.rating >= 5
                            ? "text-amber-600"
                            : "text-gray-400"
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
                        : "bg-gray-100 text-gray-600"
                    )}
                  >
                    {meeting.status === "in_progress"
                      ? "In Progress"
                      : meeting.status.charAt(0).toUpperCase() +
                        meeting.status.slice(1)}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </button>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-gray-400">
              No meetings match your filters
            </div>
          )}

          {/* Load more */}
          {hasMore && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/30 text-center">
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
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
            <Presentation className="w-8 h-8 text-brand" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            No meetings yet
          </h3>
          <p className="text-gray-500 mt-2 max-w-md">
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

// ============================================================
// Section Components
// ============================================================

function SegueSection({
  notes,
  onUpdate,
}: {
  notes: string;
  onUpdate: (val: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-purple-800 mb-1">
          Good News
        </h4>
        <p className="text-xs text-purple-600">
          Share one personal and one professional piece of good news to start the
          meeting on a positive note.
        </p>
      </div>
      <textarea
        value={notes}
        onChange={(e) => onUpdate(e.target.value)}
        placeholder="Capture good news shared by team members..."
        className="w-full h-40 p-3 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
      />
    </div>
  );
}

function ScorecardSection({
  scorecard,
  onDropToIDS,
}: {
  scorecard: ScorecardData | undefined;
  onDropToIDS?: (title: string) => void;
}) {
  if (!scorecard) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        No scorecard data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-800 mb-1">
          Weekly Scorecard
        </h4>
        <p className="text-xs text-blue-600">
          Review whether each measurable hit its goal this week. Focus only on
          off-track items — drop them to IDS.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-[1fr,100px,80px,80px,60px,60px] gap-px bg-gray-100 text-xs font-medium text-gray-600 px-4 py-2">
          <span>Measurable</span>
          <span className="text-center">Owner</span>
          <span className="text-center">Goal</span>
          <span className="text-center">Actual</span>
          <span className="text-center">Status</span>
          <span className="text-center">Action</span>
        </div>
        <div className="divide-y divide-gray-100">
          {scorecard.measurables.map((m: MeasurableData) => {
            const latestEntry = m.entries[0];
            const isOnTrack = latestEntry?.onTrack;

            return (
              <div
                key={m.id}
                className={cn(
                  "grid grid-cols-[1fr,100px,80px,80px,60px,60px] gap-px px-4 py-2.5 items-center",
                  !isOnTrack && latestEntry ? "bg-red-50/50" : ""
                )}
              >
                <span className="text-sm text-gray-900 truncate">
                  {m.title}
                </span>
                <span className="text-xs text-gray-500 text-center truncate">
                  {m.owner.name.split(" ")[0]}
                </span>
                <span className="text-xs text-gray-600 text-center font-mono">
                  {m.goalDirection === "above" ? ">=" : m.goalDirection === "below" ? "<=" : "="}{" "}
                  {m.goalValue}
                  {m.unit ? ` ${m.unit}` : ""}
                </span>
                <span
                  className={cn(
                    "text-xs text-center font-mono font-semibold",
                    !latestEntry
                      ? "text-gray-300"
                      : isOnTrack
                      ? "text-emerald-600"
                      : "text-red-600"
                  )}
                >
                  {latestEntry ? `${latestEntry.value}${m.unit ? ` ${m.unit}` : ""}` : "--"}
                </span>
                <div className="flex justify-center">
                  {!latestEntry ? (
                    <span className="text-gray-300 text-xs">--</span>
                  ) : isOnTrack ? (
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-500" />
                  )}
                </div>
                <div className="flex justify-center">
                  {!isOnTrack && latestEntry && onDropToIDS ? (
                    <button
                      onClick={() => onDropToIDS(`Off-track: ${m.title}`)}
                      className="text-[10px] px-2 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors font-medium whitespace-nowrap"
                    >
                      → IDS
                    </button>
                  ) : (
                    <span className="text-gray-200 text-xs">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {scorecard.measurables.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-8">
          No measurables configured. Add them in the Scorecard section.
        </p>
      )}
    </div>
  );
}

function RockReviewSection({ rocks }: { rocks: RockData[] | undefined }) {
  if (!rocks || rocks.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        No rocks for this quarter. Add them in the Rocks section.
      </div>
    );
  }

  const onTrack = rocks.filter((r) => r.status === "on_track" || r.status === "complete").length;
  const total = rocks.length;

  return (
    <div className="space-y-4">
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-emerald-800 mb-1">
          Quarterly Rocks
        </h4>
        <p className="text-xs text-emerald-600">
          Quick check: Is each Rock on track or off track? Do not discuss &mdash;
          drop off-track rocks into IDS.
        </p>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-3 px-1">
        <span className="text-sm text-gray-500">
          <span className="font-semibold text-gray-900">{onTrack}</span> /{" "}
          {total} on track
        </span>
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${total > 0 ? (onTrack / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {rocks.map((rock) => (
          <div
            key={rock.id}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border",
              rock.status === "on_track" || rock.status === "complete"
                ? "border-emerald-200 bg-emerald-50/50"
                : "border-red-200 bg-red-50/50"
            )}
          >
            {rock.status === "on_track" || rock.status === "complete" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {rock.title}
              </p>
              <p className="text-xs text-gray-500">
                {rock.owner.name} &middot; {rock.percentComplete}% complete
              </p>
            </div>
            <span
              className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full",
                rock.status === "on_track"
                  ? "bg-emerald-100 text-emerald-700"
                  : rock.status === "complete"
                  ? "bg-green-100 text-green-700"
                  : rock.status === "off_track"
                  ? "bg-red-100 text-red-700"
                  : "bg-gray-100 text-gray-600"
              )}
            >
              {rock.status.replace("_", " ")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeadlinesSection({
  headlines,
  onUpdate,
}: {
  headlines: string;
  onUpdate: (val: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-amber-800 mb-1">
          Customer &amp; Employee Headlines
        </h4>
        <p className="text-xs text-amber-600">
          Quick one-line updates. Good or bad news about customers or employees.
          Drop anything needing discussion into IDS.
        </p>
      </div>
      <textarea
        value={headlines}
        onChange={(e) => onUpdate(e.target.value)}
        placeholder="Capture headlines here...&#10;&#10;Example:&#10;- Customer: New enrolment at Greenfield centre (+12 places)&#10;- Employee: Sarah passed her cert III &#10;- Customer: Complaint from parent at Eastside re pickup times (IDS)"
        className="w-full h-48 p-3 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
      />
    </div>
  );
}

function TodoReviewSection({
  todos,
  onToggle,
}: {
  todos: TodoData[] | undefined;
  onToggle: (id: string, done: boolean) => void;
}) {
  if (!todos || todos.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        No to-dos for this week.
      </div>
    );
  }

  const done = todos.filter((t) => t.status === "complete").length;

  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-indigo-800 mb-1">
          To-Do Review
        </h4>
        <p className="text-xs text-indigo-600">
          Go through each to-do from last week. Mark done or not done. 90%+
          completion rate is the goal.
        </p>
      </div>

      {/* Completion Rate */}
      <div className="flex items-center gap-3 px-1">
        <span className="text-sm text-gray-500">
          <span className="font-semibold text-gray-900">{done}</span> /{" "}
          {todos.length} completed
        </span>
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              (done / todos.length) * 100 >= 90
                ? "bg-emerald-500"
                : (done / todos.length) * 100 >= 70
                ? "bg-amber-500"
                : "bg-red-500"
            )}
            style={{
              width: `${todos.length > 0 ? (done / todos.length) * 100 : 0}%`,
            }}
          />
        </div>
        <span
          className={cn(
            "text-sm font-semibold",
            (done / todos.length) * 100 >= 90
              ? "text-emerald-600"
              : (done / todos.length) * 100 >= 70
              ? "text-amber-600"
              : "text-red-600"
          )}
        >
          {todos.length > 0
            ? Math.round((done / todos.length) * 100)
            : 0}
          %
        </span>
      </div>

      <div className="space-y-1">
        {todos.map((todo) => (
          <div
            key={todo.id}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50"
          >
            <button
              onClick={() =>
                onToggle(todo.id, todo.status !== "complete")
              }
              className={cn(
                "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                todo.status === "complete"
                  ? "bg-brand border-brand"
                  : "border-gray-300 hover:border-brand"
              )}
            >
              {todo.status === "complete" && (
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "text-sm truncate",
                  todo.status === "complete"
                    ? "text-gray-400 line-through"
                    : "text-gray-900"
                )}
              >
                {todo.title}
              </p>
            </div>
            <span className="text-xs text-gray-400 flex-shrink-0">
              {todo.assignee.name.split(" ")[0]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IDSSection({
  issues,
  onUpdateStatus,
  onCreateIssue,
  onCreateTodo,
  users,
}: {
  issues: IssueData[] | undefined;
  onUpdateStatus: (id: string, status: string) => void;
  onCreateIssue: (title: string) => void;
  onCreateTodo: (data: { title: string; assigneeId: string; issueId: string }) => void;
  users: { id: string; name: string }[] | undefined;
}) {
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [showCreateIssue, setShowCreateIssue] = useState(false);
  const [newIssueTitle, setNewIssueTitle] = useState("");
  const [showCreateTodo, setShowCreateTodo] = useState<string | null>(null);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [newTodoAssignee, setNewTodoAssignee] = useState("");

  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedIssues = issues
    ? [...issues].sort(
        (a, b) =>
          priorityOrder[a.priority as keyof typeof priorityOrder] -
          priorityOrder[b.priority as keyof typeof priorityOrder]
      )
    : [];

  return (
    <div className="space-y-4">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-red-800 mb-1">
          IDS: Identify, Discuss, Solve
        </h4>
        <p className="text-xs text-red-600">
          Work through issues by priority. For each issue: Identify the real
          issue, Discuss it openly, then Solve it with a to-do or decision.
        </p>
      </div>

      {/* Create Issue Button / Form */}
      {showCreateIssue ? (
        <div className="p-3 border border-brand/20 bg-brand/5 rounded-lg space-y-2">
          <input
            autoFocus
            value={newIssueTitle}
            onChange={(e) => setNewIssueTitle(e.target.value)}
            placeholder="Describe the issue..."
            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newIssueTitle.trim()) {
                onCreateIssue(newIssueTitle.trim());
                setNewIssueTitle("");
                setShowCreateIssue(false);
              }
              if (e.key === "Escape") setShowCreateIssue(false);
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (newIssueTitle.trim()) {
                  onCreateIssue(newIssueTitle.trim());
                  setNewIssueTitle("");
                  setShowCreateIssue(false);
                }
              }}
              disabled={!newIssueTitle.trim()}
              className="text-xs px-3 py-1 bg-brand text-white rounded-md hover:bg-brand-hover disabled:opacity-50"
            >
              Create Issue
            </button>
            <button
              onClick={() => { setShowCreateIssue(false); setNewIssueTitle(""); }}
              className="text-xs px-3 py-1 text-gray-500"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowCreateIssue(true)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-brand hover:text-brand transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Issue
        </button>
      )}

      {sortedIssues.length === 0 && !showCreateIssue && (
        <div className="text-center py-8 text-gray-400 text-sm">
          No open issues. Great work!
        </div>
      )}

      <div className="space-y-2">
        {sortedIssues.map((issue) => (
          <div
            key={issue.id}
            className={cn(
              "border rounded-lg transition-all",
              selectedIssue === issue.id
                ? "border-brand bg-brand/5 shadow-sm"
                : "border-gray-200 bg-white"
            )}
          >
            <button
              onClick={() =>
                setSelectedIssue(
                  selectedIssue === issue.id ? null : issue.id
                )
              }
              className="w-full px-4 py-3 flex items-center gap-3 text-left"
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  issue.priority === "critical"
                    ? "bg-red-500"
                    : issue.priority === "high"
                    ? "bg-amber-500"
                    : issue.priority === "medium"
                    ? "bg-blue-400"
                    : "bg-gray-300"
                )}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {issue.title}
                </p>
                <p className="text-xs text-gray-500">
                  Raised by {issue.raisedBy.name}
                  {issue.owner ? ` \u00B7 Owner: ${issue.owner.name}` : ""}
                </p>
              </div>
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0",
                  issue.status === "open"
                    ? "bg-amber-100 text-amber-700"
                    : issue.status === "in_discussion"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-emerald-100 text-emerald-700"
                )}
              >
                {issue.status === "in_discussion"
                  ? "Discussing"
                  : issue.status === "open"
                  ? "Identify"
                  : "Solved"}
              </span>
            </button>

            {selectedIssue === issue.id && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                {issue.description && (
                  <p className="text-sm text-gray-600">
                    {issue.description}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Move to:</span>
                  {issue.status !== "in_discussion" && (
                    <button
                      onClick={() =>
                        onUpdateStatus(issue.id, "in_discussion")
                      }
                      className="text-xs px-3 py-1 rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors font-medium"
                    >
                      Discuss
                    </button>
                  )}
                  {issue.status !== "solved" && (
                    <button
                      onClick={() => onUpdateStatus(issue.id, "solved")}
                      className="text-xs px-3 py-1 rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors font-medium"
                    >
                      Solved
                    </button>
                  )}
                </div>

                {/* Inline Create To-Do */}
                {showCreateTodo === issue.id ? (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
                    <p className="text-[10px] font-medium text-emerald-700 uppercase tracking-wider">Create To-Do from Issue</p>
                    <input
                      autoFocus
                      value={newTodoTitle}
                      onChange={(e) => setNewTodoTitle(e.target.value)}
                      placeholder="To-do title..."
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newTodoTitle.trim() && newTodoAssignee) {
                          onCreateTodo({ title: newTodoTitle.trim(), assigneeId: newTodoAssignee, issueId: issue.id });
                          setNewTodoTitle("");
                          setNewTodoAssignee("");
                          setShowCreateTodo(null);
                        }
                        if (e.key === "Escape") setShowCreateTodo(null);
                      }}
                    />
                    <select
                      value={newTodoAssignee}
                      onChange={(e) => setNewTodoAssignee(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">Assign to...</option>
                      {users?.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (newTodoTitle.trim() && newTodoAssignee) {
                            onCreateTodo({ title: newTodoTitle.trim(), assigneeId: newTodoAssignee, issueId: issue.id });
                            setNewTodoTitle("");
                            setNewTodoAssignee("");
                            setShowCreateTodo(null);
                          }
                        }}
                        disabled={!newTodoTitle.trim() || !newTodoAssignee}
                        className="text-xs px-3 py-1 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => { setShowCreateTodo(null); setNewTodoTitle(""); setNewTodoAssignee(""); }}
                        className="text-xs px-3 py-1 text-gray-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCreateTodo(issue.id)}
                    className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 font-medium transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Create To-Do from this Issue
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConcludeSection({
  notes,
  onUpdate,
  cascadeMessages,
  onUpdateCascade,
  rating,
  onRate,
}: {
  notes: string;
  onUpdate: (val: string) => void;
  cascadeMessages: string;
  onUpdateCascade: (val: string) => void;
  rating: number | null;
  onRate: (val: number) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="bg-brand/10 border border-brand/20 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-brand mb-1">
          Conclude
        </h4>
        <p className="text-xs text-brand/70">
          Recap to-dos created, confirm who does what by when. Capture cascade
          messages for the broader team. Then rate the meeting 1-10.
        </p>
      </div>

      {/* Notes */}
      <div>
        <label className="text-sm font-medium text-gray-700 mb-1.5 block">
          Recap Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => onUpdate(e.target.value)}
          placeholder="Summary of action items, decisions made, and key takeaways..."
          className="w-full h-32 p-3 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
        />
      </div>

      {/* Cascade Messages */}
      <div>
        <label className="text-sm font-medium text-gray-700 mb-1.5 block">
          Cascade Messages
        </label>
        <p className="text-xs text-gray-500 mb-2">
          Key messages to share with the broader team after this meeting.
        </p>
        <textarea
          value={cascadeMessages}
          onChange={(e) => onUpdateCascade(e.target.value)}
          placeholder="Messages to cascade to the team...&#10;&#10;Example:&#10;- New enrolment policy starts next Monday&#10;- Holiday program bookings open this Friday&#10;- Staff training day confirmed for March 15"
          className="w-full h-32 p-3 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
        />
      </div>

      {/* Rating */}
      <div>
        <label className="text-sm font-medium text-gray-700 mb-3 block">
          Rate This Meeting
        </label>
        <div className="flex items-center gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => onRate(n)}
              className={cn(
                "w-10 h-10 rounded-lg border-2 text-sm font-bold transition-all",
                rating === n
                  ? "border-accent bg-accent text-brand scale-110 shadow-md"
                  : n <= (rating || 0)
                  ? "border-accent/50 bg-accent/20 text-brand"
                  : "border-gray-200 bg-white text-gray-400 hover:border-accent/50 hover:text-gray-600"
              )}
            >
              {n}
            </button>
          ))}
        </div>
        {rating && (
          <p className="text-xs text-gray-500 mt-2">
            {rating >= 8
              ? "Great meeting! Keep it up."
              : rating >= 5
              ? "Good meeting. Look for ways to improve."
              : "Below average. Discuss how to improve next week."}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Meeting Outcomes Panel (shown for completed meetings)
// ============================================================

function MeetingOutcomesPanel({
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
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-emerald-50/50">
        <h3 className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
          Meeting Outcomes
        </h3>
      </div>
      <div className="p-4 space-y-4">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-2 bg-gray-50 rounded-lg">
            <p className="text-lg font-bold text-gray-900">{todosDone}/{todosTotal}</p>
            <p className="text-[10px] text-gray-500 uppercase">To-Dos Done</p>
          </div>
          <div className="text-center p-2 bg-gray-50 rounded-lg">
            <p className="text-lg font-bold text-gray-900">{rocksOnTrack}/{rocksTotal}</p>
            <p className="text-[10px] text-gray-500 uppercase">Rocks On Track</p>
          </div>
          <div className="text-center p-2 bg-gray-50 rounded-lg">
            <p className="text-lg font-bold text-gray-900">{solvedIssues}</p>
            <p className="text-[10px] text-gray-500 uppercase">Issues Solved</p>
          </div>
          <div className="text-center p-2 bg-gray-50 rounded-lg">
            <p className="text-lg font-bold text-accent">{meeting.rating ?? "—"}<span className="text-xs text-gray-400">/10</span></p>
            <p className="text-[10px] text-gray-500 uppercase">Rating</p>
          </div>
        </div>

        {/* Conclude Notes */}
        {meeting.concludeNotes && (
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Recap</p>
            <p className="text-xs text-gray-600 whitespace-pre-wrap">{meeting.concludeNotes}</p>
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
                  <p className="text-xs text-gray-700">{line.replace(/^[-•*]\s*/, "")}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Active Meeting View
// ============================================================

function ActiveMeetingView({
  meeting,
  onBack,
}: {
  meeting: MeetingData;
  onBack: () => void;
}) {
  const [currentSection, setCurrentSection] = useState(meeting.currentSection);
  const [segueNotes, setSegueNotes] = useState(meeting.segueNotes || "");
  const [headlines, setHeadlines] = useState(meeting.headlines || "");
  const [concludeNotes, setConcludeNotes] = useState(meeting.concludeNotes || "");
  const [cascadeMessages, setCascadeMessages] = useState(meeting.cascadeMessages || "");
  const [rating, setRating] = useState<number | null>(meeting.rating);

  const section = L10_SECTIONS[currentSection];
  const timer = useTimer(section.duration);

  const updateMeeting = useUpdateMeeting();
  const updateTodo = useUpdateTodo();
  const updateIssue = useUpdateIssue();
  const createIssue = useCreateIssue();
  const createTodo = useCreateTodo();

  // Data hooks
  const { data: scorecard } = useScorecard();
  const { data: allRocks } = useRocks(getCurrentQuarter());
  const weekStart = getWeekStart();
  const { data: allTodos } = useTodos({ weekOf: weekStart.toISOString() });
  const { data: allOpenIssues } = useIssues({ status: "open" });
  const { data: allDiscussingIssues } = useIssues({ status: "in_discussion" });
  const { data: services } = useServices("active");
  const { data: users } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Service-level scoping: filter data by meeting's serviceIds
  const meetingServiceIds = meeting.serviceIds || [];
  const hasServiceScope = meetingServiceIds.length > 0;

  // Filter rocks by service scope
  const rocks = useMemo(() => {
    if (!allRocks) return undefined;
    if (!hasServiceScope) return allRocks;
    return allRocks.filter(
      (r) => r.serviceId && meetingServiceIds.includes(r.serviceId)
    );
  }, [allRocks, hasServiceScope, meetingServiceIds]);

  // Filter scorecard: only show measurables for scoped services
  const filteredScorecard = useMemo(() => {
    if (!scorecard) return undefined;
    if (!hasServiceScope) return scorecard;
    return {
      ...scorecard,
      measurables: scorecard.measurables.filter(
        (m) => m.serviceId && meetingServiceIds.includes(m.serviceId)
      ),
    };
  }, [scorecard, hasServiceScope, meetingServiceIds]);

  // Filter todos by service scope
  const todos = useMemo(() => {
    if (!allTodos) return undefined;
    if (!hasServiceScope) return allTodos;
    return allTodos.filter(
      (t) => t.serviceId && meetingServiceIds.includes(t.serviceId)
    );
  }, [allTodos, hasServiceScope, meetingServiceIds]);

  // Filter issues by service scope
  const issues = useMemo(() => {
    if (!allOpenIssues) return undefined;
    if (!hasServiceScope) return allOpenIssues;
    return allOpenIssues.filter(
      (i) => i.serviceId && meetingServiceIds.includes(i.serviceId)
    );
  }, [allOpenIssues, hasServiceScope, meetingServiceIds]);

  const discussingIssues = useMemo(() => {
    if (!allDiscussingIssues) return undefined;
    if (!hasServiceScope) return allDiscussingIssues;
    return allDiscussingIssues.filter(
      (i) => i.serviceId && meetingServiceIds.includes(i.serviceId)
    );
  }, [allDiscussingIssues, hasServiceScope, meetingServiceIds]);

  // Service names for display
  const scopedServiceNames = useMemo(() => {
    if (!hasServiceScope || !services) return [];
    return services
      .filter((s) => meetingServiceIds.includes(s.id))
      .map((s) => s.name);
  }, [hasServiceScope, services, meetingServiceIds]);

  // Merge open + discussing issues for IDS
  const allIDSIssues = [
    ...(issues || []),
    ...(discussingIssues || []),
  ];

  // Auto-save section state on change
  const saveProgress = useCallback(() => {
    updateMeeting.mutate({
      id: meeting.id,
      currentSection,
      segueNotes,
      headlines,
      concludeNotes,
      cascadeMessages,
      rating,
    });
  }, [meeting.id, currentSection, segueNotes, headlines, concludeNotes, cascadeMessages, rating, updateMeeting]);

  // Save on section change
  const goToSection = useCallback(
    (index: number) => {
      saveProgress();
      setCurrentSection(index);
      timer.reset(L10_SECTIONS[index].duration);
    },
    [saveProgress, timer]
  );

  const goNext = useCallback(() => {
    if (currentSection < L10_SECTIONS.length - 1) {
      goToSection(currentSection + 1);
    }
  }, [currentSection, goToSection]);

  const goPrev = useCallback(() => {
    if (currentSection > 0) {
      goToSection(currentSection - 1);
    }
  }, [currentSection, goToSection]);

  const handleComplete = useCallback(() => {
    updateMeeting.mutate({
      id: meeting.id,
      status: "completed",
      currentSection,
      segueNotes,
      headlines,
      concludeNotes,
      cascadeMessages,
      rating,
    });
  }, [meeting.id, currentSection, segueNotes, headlines, concludeNotes, cascadeMessages, rating, updateMeeting]);

  const handleTodoToggle = useCallback(
    (id: string, done: boolean) => {
      updateTodo.mutate({
        id,
        status: done ? "complete" : "pending",
      });
    },
    [updateTodo]
  );

  const handleIssueStatus = useCallback(
    (id: string, status: string) => {
      updateIssue.mutate({
        id,
        status: status as "open" | "in_discussion" | "solved" | "closed",
      });
    },
    [updateIssue]
  );

  const handleCreateIssue = useCallback(
    (title: string) => {
      createIssue.mutate({ title });
    },
    [createIssue]
  );

  const handleCreateTodoFromIssue = useCallback(
    (data: { title: string; assigneeId: string; issueId: string }) => {
      const ws = getWeekStart();
      createTodo.mutate({
        title: data.title,
        assigneeId: data.assigneeId,
        issueId: data.issueId,
        dueDate: new Date(ws.getTime() + 6 * 86400000).toISOString().split("T")[0],
        weekOf: ws.toISOString(),
      });
    },
    [createTodo]
  );

  const handleDropToIDS = useCallback(
    (title: string) => {
      createIssue.mutate({ title, priority: "high" });
    },
    [createIssue]
  );

  const isCompleted = meeting.status === "completed";
  const SectionIcon = section.icon;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Top Bar */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => {
            saveProgress();
            onBack();
          }}
          className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-gray-900 truncate">
            {meeting.title}
          </h2>
          <p className="text-xs text-gray-500">
            {formatDateAU(meeting.date)}{" "}
            {scopedServiceNames.length > 0 && (
              <>
                &middot;{" "}
                <span className="text-brand font-medium">
                  {scopedServiceNames.join(", ")}
                </span>
              </>
            )}
            {isCompleted && meeting.rating && (
              <>
                &middot; Rated{" "}
                <span className="font-semibold text-brand">
                  {meeting.rating}/10
                </span>
              </>
            )}
          </p>
        </div>
        {isCompleted ? (
          <span className="text-xs px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">
            Completed
          </span>
        ) : (
          <button
            onClick={handleComplete}
            disabled={currentSection !== 6}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              currentSection === 6
                ? "bg-brand text-white hover:bg-brand-hover shadow-sm"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            )}
          >
            <CheckCircle2 className="w-4 h-4" />
            End Meeting
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center gap-1">
          {L10_SECTIONS.map((s, idx) => {
            const Icon = s.icon;
            const isActive = idx === currentSection;
            const isPast = idx < currentSection;
            return (
              <button
                key={s.key}
                onClick={() => !isCompleted && goToSection(idx)}
                disabled={isCompleted}
                className={cn(
                  "flex-1 group relative",
                  isCompleted ? "cursor-default" : "cursor-pointer"
                )}
              >
                <div
                  className={cn(
                    "h-2 rounded-full transition-all",
                    isActive
                      ? "bg-brand"
                      : isPast
                      ? "bg-brand/40"
                      : "bg-gray-200"
                  )}
                />
                <div
                  className={cn(
                    "flex items-center gap-1 mt-1.5 justify-center",
                    isActive
                      ? "text-brand"
                      : isPast
                      ? "text-brand/50"
                      : "text-gray-400"
                  )}
                >
                  <Icon className="w-3 h-3" />
                  <span className="text-[10px] font-medium hidden lg:inline">
                    {s.label}
                  </span>
                </div>
                {/* Tooltip on hover */}
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                  <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    {s.label} ({s.duration}m)
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,280px] gap-6">
        {/* Main Content */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Section Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-gray-200"
                )}
              >
                <SectionIcon className={cn("w-4 h-4", section.color)} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {currentSection + 1}. {section.label}
                </h3>
                <p className="text-xs text-gray-500">
                  {section.duration} min allocated
                </p>
              </div>
            </div>

            {/* Timer */}
            {!isCompleted && (
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "font-mono text-lg font-bold tabular-nums",
                    timer.isOvertime
                      ? "text-red-500 animate-pulse"
                      : timer.totalSeconds <= 60
                      ? "text-amber-500"
                      : "text-gray-700"
                  )}
                >
                  {String(timer.minutes).padStart(2, "0")}:
                  {String(timer.seconds).padStart(2, "0")}
                </div>
                <button
                  onClick={timer.toggle}
                  className={cn(
                    "p-1.5 rounded-md border transition-colors",
                    timer.isRunning
                      ? "border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100"
                      : "border-brand bg-brand/10 text-brand hover:bg-brand/20"
                  )}
                >
                  {timer.isRunning ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Section Content */}
          <div className="p-6">
            {currentSection === 0 && (
              <SegueSection notes={segueNotes} onUpdate={setSegueNotes} />
            )}
            {currentSection === 1 && (
              <ScorecardSection scorecard={filteredScorecard} onDropToIDS={handleDropToIDS} />
            )}
            {currentSection === 2 && (
              <RockReviewSection rocks={rocks} />
            )}
            {currentSection === 3 && (
              <HeadlinesSection headlines={headlines} onUpdate={setHeadlines} />
            )}
            {currentSection === 4 && (
              <TodoReviewSection
                todos={todos}
                onToggle={handleTodoToggle}
              />
            )}
            {currentSection === 5 && (
              <IDSSection
                issues={allIDSIssues}
                onUpdateStatus={handleIssueStatus}
                onCreateIssue={handleCreateIssue}
                onCreateTodo={handleCreateTodoFromIssue}
                users={users}
              />
            )}
            {currentSection === 6 && (
              <ConcludeSection
                notes={concludeNotes}
                onUpdate={setConcludeNotes}
                cascadeMessages={cascadeMessages}
                onUpdateCascade={setCascadeMessages}
                rating={rating}
                onRate={setRating}
              />
            )}
          </div>

          {/* Navigation Footer */}
          {!isCompleted && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-gray-50/30">
              <button
                onClick={goPrev}
                disabled={currentSection === 0}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                  currentSection === 0
                    ? "text-gray-300 cursor-not-allowed"
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-xs text-gray-400">
                {currentSection + 1} / {L10_SECTIONS.length}
              </span>
              {currentSection < L10_SECTIONS.length - 1 ? (
                <button
                  onClick={goNext}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-brand hover:bg-brand/10 transition-colors"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleComplete}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg bg-brand text-white hover:bg-brand-hover transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  End Meeting
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sidebar — Agenda Overview */}
        <div className="space-y-4">
          {/* Agenda Card */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Agenda
              </h3>
            </div>
            <div className="divide-y divide-gray-50">
              {L10_SECTIONS.map((s, idx) => {
                const Icon = s.icon;
                const isActive = idx === currentSection;
                const isPast = idx < currentSection;
                return (
                  <button
                    key={s.key}
                    onClick={() => !isCompleted && goToSection(idx)}
                    disabled={isCompleted}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                      isActive
                        ? "bg-brand/5"
                        : isCompleted
                        ? ""
                        : "hover:bg-gray-50"
                    )}
                  >
                    <div
                      className={cn(
                        "w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold",
                        isActive
                          ? "bg-brand text-white"
                          : isPast
                          ? "bg-brand/20 text-brand"
                          : "bg-gray-100 text-gray-400"
                      )}
                    >
                      {isPast ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-sm font-medium truncate",
                          isActive
                            ? "text-brand"
                            : isPast
                            ? "text-gray-400"
                            : "text-gray-700"
                        )}
                      >
                        {s.label}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        isActive ? "text-brand" : "text-gray-400"
                      )}
                    >
                      {s.duration}m
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/30">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Total</span>
                <span className="text-xs font-semibold text-gray-700">
                  {L10_SECTIONS.reduce((sum, s) => sum + s.duration, 0)} min
                </span>
              </div>
            </div>
          </div>

          {/* Outcomes (completed) or Quick Stats (in progress) */}
          {isCompleted ? (
            <MeetingOutcomesPanel
              meeting={meeting}
              rocks={rocks}
              todos={todos}
              issues={allIDSIssues}
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Quick Stats
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Rocks on track</span>
                  <span className="text-xs font-semibold text-gray-700">
                    {rocks
                      ? `${
                          rocks.filter(
                            (r) =>
                              r.status === "on_track" ||
                              r.status === "complete"
                          ).length
                        }/${rocks.length}`
                      : "--"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">To-dos done</span>
                  <span className="text-xs font-semibold text-gray-700">
                    {todos
                      ? `${
                          todos.filter((t) => t.status === "complete").length
                        }/${todos.length}`
                      : "--"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Open issues</span>
                  <span className="text-xs font-semibold text-gray-700">
                    {allIDSIssues.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Scorecard items</span>
                  <span className="text-xs font-semibold text-gray-700">
                    {filteredScorecard ? filteredScorecard.measurables.length : "--"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main Page Component
// ============================================================

// ============================================================
// Start Meeting Dialog (Service Selector)
// ============================================================

function StartMeetingDialog({
  onStart,
  onCancel,
  isPending,
}: {
  onStart: (serviceIds: string[]) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const { data: services } = useServices("active");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (services) setSelectedServiceIds(services.map((s) => s.id));
  };

  const clearAll = () => setSelectedServiceIds([]);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-50"
        onClick={onCancel}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                Start L10 Meeting
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Select which services to include in this meeting
              </p>
            </div>
            <button
              onClick={onCancel}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onStart([])}
                className="text-xs px-3 py-1.5 border border-brand text-brand rounded-lg hover:bg-brand/5 transition-colors font-medium"
              >
                Company-Wide Meeting
              </button>
              <button
                onClick={selectAll}
                className="text-xs px-3 py-1.5 text-gray-500 hover:text-gray-700 transition-colors"
              >
                Select All
              </button>
              {selectedServiceIds.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-xs px-3 py-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Services Grid */}
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {services?.map((service) => {
                const selected = selectedServiceIds.includes(service.id);
                return (
                  <button
                    key={service.id}
                    onClick={() => toggleService(service.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left",
                      selected
                        ? "border-brand bg-brand/5"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                        selected
                          ? "bg-brand border-brand"
                          : "border-gray-300"
                      )}
                    >
                      {selected && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {service.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {service.code}
                        {service.state ? ` · ${service.state}` : ""}
                      </p>
                    </div>
                    <Building2 className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </button>
                );
              })}
              {(!services || services.length === 0) && (
                <p className="text-center text-sm text-gray-400 py-4">
                  No active services found
                </p>
              )}
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {selectedServiceIds.length > 0
                ? `${selectedServiceIds.length} service${selectedServiceIds.length > 1 ? "s" : ""} selected`
                : "Company-wide (no service filter)"}
            </span>
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="text-xs px-4 py-2 text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => onStart(selectedServiceIds)}
                disabled={isPending}
                className="text-xs px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors font-medium disabled:opacity-50"
              >
                {isPending ? "Starting..." : selectedServiceIds.length > 0 ? "Start Service Meeting" : "Start Meeting"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function MeetingsPage() {
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [showStartDialog, setShowStartDialog] = useState(false);

  const { data: meetings, isLoading, error, refetch } = useMeetings({ limit: 100 });
  const createMeeting = useCreateMeeting();

  const activeMeeting = meetings?.find((m) => m.id === activeMeetingId);

  const handleStartNew = () => {
    setShowStartDialog(true);
  };

  const handleConfirmStart = async (serviceIds: string[]) => {
    const now = new Date();
    const title = serviceIds.length > 0
      ? `L10 Meeting — ${formatDateAU(now)}`
      : `L10 Meeting — ${formatDateAU(now)}`;
    try {
      const newMeeting = await createMeeting.mutateAsync({
        title,
        date: now.toISOString(),
        serviceIds,
      });
      setShowStartDialog(false);
      setActiveMeetingId(newMeeting.id);
    } catch {
      // Error handled by mutation
    }
  };

  const handleSelectMeeting = (meeting: MeetingData) => {
    setActiveMeetingId(meeting.id);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin w-8 h-8 border-2 border-brand border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <ErrorState
          title="Failed to load meetings"
          error={error as Error}
          onRetry={refetch}
        />
      </div>
    );
  }

  if (activeMeeting) {
    return (
      <ActiveMeetingView
        meeting={activeMeeting}
        onBack={() => setActiveMeetingId(null)}
      />
    );
  }

  return (
    <>
      <MeetingListView
        meetings={meetings || []}
        onStartNew={handleStartNew}
        onSelect={handleSelectMeeting}
      />
      {showStartDialog && (
        <StartMeetingDialog
          onStart={handleConfirmStart}
          onCancel={() => setShowStartDialog(false)}
          isPending={createMeeting.isPending}
        />
      )}
    </>
  );
}

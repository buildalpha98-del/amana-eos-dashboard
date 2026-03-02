"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useMeetings,
  useCreateMeeting,
  useUpdateMeeting,
} from "@/hooks/useMeetings";
import { useScorecard } from "@/hooks/useScorecard";
import { useRocks } from "@/hooks/useRocks";
import { useTodos, useUpdateTodo } from "@/hooks/useTodos";
import { useIssues, useUpdateIssue } from "@/hooks/useIssues";
import type { MeetingData } from "@/hooks/useMeetings";
import type { RockData } from "@/hooks/useRocks";
import type { TodoData } from "@/hooks/useTodos";
import type { IssueData } from "@/hooks/useIssues";
import type { ScorecardData, MeasurableData } from "@/hooks/useScorecard";
import { cn, formatDateAU, getWeekStart, getCurrentQuarter } from "@/lib/utils";
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
  { key: "conclude", label: "Conclude", duration: 5, icon: Trophy, color: "text-[#004E64]" },
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
  const activeMeeting = meetings.find((m) => m.status === "in_progress");

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
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors shadow-sm"
        >
          <Play className="w-4 h-4" />
          Start New Meeting
        </button>
      </div>

      {/* Active Meeting Banner */}
      {activeMeeting && (
        <button
          onClick={() => onSelect(activeMeeting)}
          className="w-full mb-6 p-4 bg-[#004E64]/5 border-2 border-[#004E64] rounded-xl flex items-center gap-4 text-left hover:bg-[#004E64]/10 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-[#004E64] flex items-center justify-center">
            <Presentation className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#004E64]">
              Meeting In Progress
            </p>
            <p className="text-xs text-gray-600 truncate">
              {activeMeeting.title} &mdash; Section{" "}
              {activeMeeting.currentSection + 1} of 7:{" "}
              {L10_SECTIONS[activeMeeting.currentSection]?.label}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[#004E64]">
            <span className="text-sm font-medium">Resume</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </button>
      )}

      {/* Past Meetings */}
      {meetings.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-sm font-medium text-gray-700">Meeting History</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {meetings.map((meeting) => (
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
                      ? "bg-[#004E64]/10"
                      : "bg-gray-100"
                  )}
                >
                  {meeting.status === "completed" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : meeting.status === "in_progress" ? (
                    <Timer className="w-4 h-4 text-[#004E64]" />
                  ) : (
                    <Calendar className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {meeting.title}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDateAU(meeting.date)} &middot; {meeting.createdBy.name}
                  </p>
                </div>
                {meeting.rating && (
                  <div className="flex items-center gap-1">
                    <Star
                      className={cn(
                        "w-3.5 h-3.5",
                        meeting.rating >= 8
                          ? "text-[#FECE00] fill-[#FECE00]"
                          : meeting.rating >= 5
                          ? "text-amber-400 fill-amber-400"
                          : "text-gray-300 fill-gray-300"
                      )}
                    />
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        meeting.rating >= 8
                          ? "text-[#004E64]"
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
                      ? "bg-[#004E64]/10 text-[#004E64]"
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
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 rounded-2xl bg-[#004E64]/10 flex items-center justify-center mb-4">
            <Presentation className="w-8 h-8 text-[#004E64]" />
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
            className="mt-6 inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors shadow-sm"
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
        className="w-full h-40 p-3 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
      />
    </div>
  );
}

function ScorecardSection({ scorecard }: { scorecard: ScorecardData | undefined }) {
  const weekStart = getWeekStart();

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
          off-track items.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-[1fr,100px,80px,80px,60px] gap-px bg-gray-100 text-xs font-medium text-gray-600 px-4 py-2">
          <span>Measurable</span>
          <span className="text-center">Owner</span>
          <span className="text-center">Goal</span>
          <span className="text-center">Actual</span>
          <span className="text-center">Status</span>
        </div>
        <div className="divide-y divide-gray-100">
          {scorecard.measurables.map((m: MeasurableData) => {
            const latestEntry = m.entries[0];
            const isOnTrack = latestEntry?.onTrack;

            return (
              <div
                key={m.id}
                className={cn(
                  "grid grid-cols-[1fr,100px,80px,80px,60px] gap-px px-4 py-2.5 items-center",
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
        className="w-full h-48 p-3 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
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
                  ? "bg-[#004E64] border-[#004E64]"
                  : "border-gray-300 hover:border-[#004E64]"
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
}: {
  issues: IssueData[] | undefined;
  onUpdateStatus: (id: string, status: string) => void;
}) {
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);

  if (!issues || issues.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        No open issues. Great work!
      </div>
    );
  }

  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedIssues = [...issues].sort(
    (a, b) =>
      priorityOrder[a.priority as keyof typeof priorityOrder] -
      priorityOrder[b.priority as keyof typeof priorityOrder]
  );

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

      <div className="space-y-2">
        {sortedIssues.map((issue) => (
          <div
            key={issue.id}
            className={cn(
              "border rounded-lg transition-all",
              selectedIssue === issue.id
                ? "border-[#004E64] bg-[#004E64]/5 shadow-sm"
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
              <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                {issue.description && (
                  <p className="text-sm text-gray-600 mb-3">
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
  rating,
  onRate,
}: {
  notes: string;
  onUpdate: (val: string) => void;
  rating: number | null;
  onRate: (val: number) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="bg-[#004E64]/10 border border-[#004E64]/20 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-[#004E64] mb-1">
          Conclude
        </h4>
        <p className="text-xs text-[#004E64]/70">
          Recap to-dos created, confirm who does what by when. Then rate the
          meeting 1-10.
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
          className="w-full h-32 p-3 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
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
                  ? "border-[#FECE00] bg-[#FECE00] text-[#004E64] scale-110 shadow-md"
                  : n <= (rating || 0)
                  ? "border-[#FECE00]/50 bg-[#FECE00]/20 text-[#004E64]"
                  : "border-gray-200 bg-white text-gray-400 hover:border-[#FECE00]/50 hover:text-gray-600"
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
  const [rating, setRating] = useState<number | null>(meeting.rating);

  const section = L10_SECTIONS[currentSection];
  const timer = useTimer(section.duration);

  const updateMeeting = useUpdateMeeting();
  const updateTodo = useUpdateTodo();
  const updateIssue = useUpdateIssue();

  // Data hooks
  const { data: scorecard } = useScorecard();
  const { data: rocks } = useRocks(getCurrentQuarter());
  const weekStart = getWeekStart();
  const { data: todos } = useTodos({ weekOf: weekStart.toISOString() });
  const { data: issues } = useIssues({ status: "open" });
  const { data: discussingIssues } = useIssues({ status: "in_discussion" });

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
      rating,
    });
  }, [meeting.id, currentSection, segueNotes, headlines, concludeNotes, rating, updateMeeting]);

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
      rating,
    });
  }, [meeting.id, currentSection, segueNotes, headlines, concludeNotes, rating, updateMeeting]);

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
            {isCompleted && meeting.rating && (
              <>
                &middot; Rated{" "}
                <span className="font-semibold text-[#004E64]">
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
                ? "bg-[#004E64] text-white hover:bg-[#003D52] shadow-sm"
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
                      ? "bg-[#004E64]"
                      : isPast
                      ? "bg-[#004E64]/40"
                      : "bg-gray-200"
                  )}
                />
                <div
                  className={cn(
                    "flex items-center gap-1 mt-1.5 justify-center",
                    isActive
                      ? "text-[#004E64]"
                      : isPast
                      ? "text-[#004E64]/50"
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
                      : "border-[#004E64] bg-[#004E64]/10 text-[#004E64] hover:bg-[#004E64]/20"
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
              <ScorecardSection scorecard={scorecard} />
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
              />
            )}
            {currentSection === 6 && (
              <ConcludeSection
                notes={concludeNotes}
                onUpdate={setConcludeNotes}
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-[#004E64] hover:bg-[#004E64]/10 transition-colors"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleComplete}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg bg-[#004E64] text-white hover:bg-[#003D52] transition-colors"
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
                        ? "bg-[#004E64]/5"
                        : isCompleted
                        ? ""
                        : "hover:bg-gray-50"
                    )}
                  >
                    <div
                      className={cn(
                        "w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold",
                        isActive
                          ? "bg-[#004E64] text-white"
                          : isPast
                          ? "bg-[#004E64]/20 text-[#004E64]"
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
                            ? "text-[#004E64]"
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
                        isActive ? "text-[#004E64]" : "text-gray-400"
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

          {/* Quick Stats */}
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
                  {scorecard ? scorecard.measurables.length : "--"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main Page Component
// ============================================================

export default function MeetingsPage() {
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);

  const { data: meetings, isLoading } = useMeetings();
  const createMeeting = useCreateMeeting();

  const activeMeeting = meetings?.find((m) => m.id === activeMeetingId);

  const handleStartNew = async () => {
    const now = new Date();
    const title = `L10 Meeting — ${formatDateAU(now)}`;
    try {
      const newMeeting = await createMeeting.mutateAsync({
        title,
        date: now.toISOString(),
      });
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
        <div className="animate-spin w-8 h-8 border-2 border-[#004E64] border-t-transparent rounded-full" />
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
    <MeetingListView
      meetings={meetings || []}
      onStartNew={handleStartNew}
      onSelect={handleSelectMeeting}
    />
  );
}

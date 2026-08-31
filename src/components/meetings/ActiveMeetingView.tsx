"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Mic,
  Pause,
  Play,
  Square,
  UserCheck,
  UserX,
} from "lucide-react";
import { useUpdateMeeting, usePrepareMeeting } from "@/hooks/useMeetings";
import { useScorecard, useCreateEntry } from "@/hooks/useScorecard";
import { useScorecardDetail } from "@/hooks/useScorecards";
import { useRocks, useUpdateRock } from "@/hooks/useRocks";
import { useTodos, useUpdateTodo, useCreateTodo } from "@/hooks/useTodos";
import { isLeadershipMeetingRole } from "@/lib/role-enum";
import { useIssues, useUpdateIssue, useCreateIssue } from "@/hooks/useIssues";
import type { MeetingData } from "@/hooks/useMeetings";
import { useServices } from "@/hooks/useServices";
import {
  cn,
  formatDateAU,
  getWeekStart,
  getCurrentQuarter,
} from "@/lib/utils";
import { fetchApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { L10_SECTIONS } from "./sections";
import { useTimer } from "./useTimer";
import { SegueSection } from "./SegueSection";
import { ScorecardSection } from "./ScorecardSection";
import { RockReviewSection } from "./RockReviewSection";
import { HeadlinesSection } from "./HeadlinesSection";
import { TodoReviewSection } from "./TodoReviewSection";
import { IDSSection } from "./IDSSection";
import { ConcludeSection } from "./ConcludeSection";
import { MeetingOutcomesPanel } from "./MeetingOutcomesPanel";
import { AiAgendaPanel } from "./AiAgendaPanel";
import { MeetingAiReviewPanel } from "./MeetingAiReviewPanel";
import { useMeetingRecorder } from "@/hooks/useMeetingRecorder";
import { useCreateRecording } from "@/hooks/useMeetingRecordings";
import { uploadFileSmart } from "@/lib/upload-client";

export function ActiveMeetingView({
  meeting,
  onBack,
  lastMeetingId,
}: {
  meeting: MeetingData;
  onBack: () => void;
  /** Previous completed meeting of the same kind — drives the To-Do
   *  Review "from last meeting" carry-over badge. */
  lastMeetingId?: string | null;
}) {
  const [currentSection, setCurrentSection] = useState(meeting.currentSection);
  const [segueNotes, setSegueNotes] = useState(meeting.segueNotes || "");
  const [headlines, setHeadlines] = useState(meeting.headlines || "");
  const [concludeNotes, setConcludeNotes] = useState(meeting.concludeNotes || "");
  const [cascadeMessages, setCascadeMessages] = useState(meeting.cascadeMessages || "");
  const [rating, setRating] = useState<number | null>(meeting.rating);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [attendeeRatings, setAttendeeRatings] = useState<Record<string, number>>(() => {
    const ratings: Record<string, number> = {};
    if (meeting.attendees) {
      meeting.attendees.forEach((a) => {
        if (a.rating) ratings[a.userId] = a.rating;
      });
    }
    return ratings;
  });

  const section = L10_SECTIONS[currentSection];
  const timer = useTimer(section.duration);

  const updateMeeting = useUpdateMeeting();
  const prepareMeeting = usePrepareMeeting();
  const updateTodo = useUpdateTodo();
  const updateIssue = useUpdateIssue();
  const updateRock = useUpdateRock();
  const createIssue = useCreateIssue();
  const createTodo = useCreateTodo();
  const createEntry = useCreateEntry();

  // ── Recording (Phase 2, 2026-08-31) ─────────────────────────────
  // Mirrors the server's meeting-role gate; the API enforces it too.
  const { data: sessionData } = useSession();
  const canRecord = [
    "owner",
    "head_office",
    "admin",
    "marketing",
    "eos_implementer",
  ].includes(sessionData?.user?.role ?? "");
  const createRecording = useCreateRecording(meeting.id);
  const recorder = useMeetingRecorder({
    onRecorded: async (file, durationSeconds) => {
      try {
        const result = await uploadFileSmart(file, { context: "recording" });
        createRecording.mutate({
          url: result.fileUrl,
          source: "live_mic",
          durationSeconds,
        });
      } catch (err) {
        toast({
          variant: "destructive",
          description:
            err instanceof Error ? err.message : "Recording upload failed",
        });
      }
    },
  });

  // Data hooks
  // 2026-07-28: a meeting can target a specific Scorecard. Meetings created
  // before that column existed have scorecardId = null and fall back to the
  // legacy single scorecard, so historical meetings render unchanged.
  // useScorecardDetail is disabled when the id is null, so only one of these
  // two queries ever actually fires.
  const { data: selectedScorecard } = useScorecardDetail(meeting.scorecardId);
  const { data: legacyScorecard } = useScorecard();
  const scorecard = meeting.scorecardId ? selectedScorecard : legacyScorecard;
  const { data: allRocks } = useRocks(getCurrentQuarter());
  // 2026-06-05: To-Do Review now shows ALL open todos for the people
  // attending this meeting — not just last week's todos. Daniel
  // pointed out that filtering to "weekOf=last week" missed older
  // open todos that the attendees still owed, and showed weekly todos
  // for people who weren't in the room.
  //
  // We fetch every todo here and filter to attendee userIds +
  // not-yet-completed status in the `todos` memo below.
  const { data: allTodos } = useTodos();
  const { data: allIDSIssuesRaw } = useIssues({ status: "open,in_discussion", category: "short_term" });
  const { data: services } = useServices("active");
  const { data: users } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["users-list"],
    queryFn: () => fetchApi<{ id: string; name: string }[]>("/api/users?scope=eos_assignees"),
    retry: 2,
    staleTime: 60_000,
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

  // 2026-06-05: derive the attendee userId set once so the todos
  // memo doesn't rebuild it every render. Empty set when no
  // attendees are recorded — we fall back to the legacy
  // service-scope filter in that case so the meeting view still
  // works for meetings that haven't been set up with attendees.
  const attendeeUserIds = useMemo(() => {
    const ids = new Set<string>();
    if (meeting.attendees) {
      for (const a of meeting.attendees) {
        ids.add(a.userId);
      }
    }
    return ids;
  }, [meeting.attendees]);

  // Filter todos for the L10 review:
  //   - ALL incomplete (so commitments older than a week still surface)
  //   - PLUS todos COMPLETED within the previous week (Mon-Sun before
  //     this week) — to celebrate the wins from the period being reviewed
  //   - Restricted to the attendees of THIS meeting in either case;
  //     people who weren't invited shouldn't have their todos pulled in.
  // 2026-06-15: completed-last-week added at Daniel's request — bare
  // open list lost the "what got done since last L10" signal.
  const todos = useMemo(() => {
    if (!allTodos) return undefined;
    // Find Monday 00:00 of THIS week, then Monday 00:00 of LAST week.
    const today = new Date();
    const dow = today.getDay();
    const mondayDiff = dow === 0 ? -6 : 1 - dow;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() + mondayDiff);
    thisMonday.setHours(0, 0, 0, 0);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);

    const openOrRecent = allTodos.filter((t) => {
      if (t.status === "cancelled") return false;
      if (t.status !== "complete") return true; // open todo — always included
      // Completed todo — only include if completed during the previous week.
      if (!t.completedAt) return false;
      const completed = new Date(t.completedAt);
      return completed >= lastMonday && completed < thisMonday;
    });

    // 2026-07-28: on a Leadership (L10) meeting the review is restricted
    // to leadership-role owners as well as attendance, so an educator's
    // or coordinator's todos never surface in the leadership agenda even
    // if they were added to the meeting. Non-leadership meetings keep the
    // previous attendance-only behaviour.
    const byRole = meeting.isLeadership
      ? openOrRecent.filter((t) => isLeadershipMeetingRole(t.assignee?.role))
      : openOrRecent;

    if (attendeeUserIds.size > 0) {
      return byRole.filter(
        (t) => !!t.assigneeId && attendeeUserIds.has(t.assigneeId),
      );
    }
    // No attendees recorded — fall back to service scope so the
    // legacy "all todos at this centre" behaviour still works. A
    // leadership meeting stays role-restricted even on this path.
    if (!hasServiceScope) return byRole;
    return byRole.filter(
      (t) => !t.serviceId || meetingServiceIds.includes(t.serviceId),
    );
  }, [
    allTodos,
    attendeeUserIds,
    hasServiceScope,
    meetingServiceIds,
    meeting.isLeadership,
  ]);

  // Filter + deduplicate IDS issues by service scope
  const allIDSIssues = useMemo(() => {
    if (!allIDSIssuesRaw) return [];
    const filtered = hasServiceScope
      ? allIDSIssuesRaw.filter((i) => !i.serviceId || meetingServiceIds.includes(i.serviceId))
      : allIDSIssuesRaw;
    // Deduplicate by id as safety net
    return [...new Map(filtered.map((i) => [i.id, i])).values()];
  }, [allIDSIssuesRaw, hasServiceScope, meetingServiceIds]);

  // Service names for display
  const scopedServiceNames = useMemo(() => {
    if (!hasServiceScope || !services) return [];
    return services
      .filter((s) => meetingServiceIds.includes(s.id))
      .map((s) => s.name);
  }, [hasServiceScope, services, meetingServiceIds]);

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
    // Build attendee updates from ratings
    const attendeeUpdates = Object.entries(attendeeRatings).map(([userId, r]) => ({
      userId,
      rating: r,
    }));

    updateMeeting.mutate(
      {
        id: meeting.id,
        status: "completed",
        currentSection,
        segueNotes,
        headlines,
        concludeNotes,
        cascadeMessages,
        rating,
        ...(attendeeUpdates.length > 0 ? { attendeeUpdates } : {}),
      },
      {
        onError: (err: Error) => {
          toast({ variant: "destructive", description: err.message || "Failed to end meeting" });
        },
      }
    );
  }, [meeting.id, currentSection, segueNotes, headlines, concludeNotes, cascadeMessages, rating, attendeeRatings, updateMeeting]);

  const handleTodoToggle = useCallback(
    (id: string, done: boolean) => {
      updateTodo.mutate({
        id,
        status: done ? "complete" : "pending",
      });
    },
    [updateTodo]
  );

  // 2026-08-31: To-Do Review is a capture surface — new commitments made
  // in the room land here, stamped with this meeting's id.
  const handleQuickAddTodo = useCallback(
    (data: { title: string; assigneeId: string; dueDate: string }) => {
      createTodo.mutate({
        title: data.title,
        assigneeId: data.assigneeId,
        dueDate: data.dueDate,
        weekOf: getWeekStart().toISOString(),
        meetingId: meeting.id,
        serviceId:
          meetingServiceIds.length === 1 ? meetingServiceIds[0] : undefined,
      });
    },
    [createTodo, meeting.id, meetingServiceIds]
  );

  const handleReassignTodo = useCallback(
    (id: string, assigneeId: string) => {
      updateTodo.mutate({ id, assigneeId });
    },
    [updateTodo]
  );

  const handleRedateTodo = useCallback(
    (id: string, dueDate: string) => {
      updateTodo.mutate({ id, dueDate });
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

  const handleDropToLongTerm = useCallback(
    (id: string) => {
      updateIssue.mutate({ id, category: "long_term" });
    },
    [updateIssue]
  );

  const handleCreateIssue = useCallback(
    (title: string, priority?: string) => {
      createIssue.mutate({
        title,
        priority: (priority || "medium") as any,
        serviceId: meetingServiceIds.length === 1 ? meetingServiceIds[0] : undefined,
        category: "short_term",
      });
    },
    [createIssue, meetingServiceIds]
  );

  const handleCreateTodoFromIssue = useCallback(
    (data: { title: string; description?: string; assigneeIds: string[]; issueId: string }) => {
      const ws = getWeekStart();
      createTodo.mutate({
        title: data.title,
        description: data.description,
        assigneeId: data.assigneeIds[0],
        assigneeIds: data.assigneeIds.length > 1 ? data.assigneeIds : undefined,
        issueId: data.issueId,
        serviceId: meetingServiceIds.length === 1 ? meetingServiceIds[0] : undefined,
        meetingId: meeting.id,
        dueDate: new Date(ws.getTime() + 6 * 86400000).toISOString().split("T")[0],
        weekOf: ws.toISOString(),
      });
    },
    [createTodo, meetingServiceIds, meeting.id]
  );

  const handleDropToIDS = useCallback(
    (title: string) => {
      createIssue.mutate({ title, priority: "high" });
    },
    [createIssue]
  );

  // 2026-06-05: Drop a Rock into IDS during the rocks section. Creates
  // an Issue linked to the rock via rockId so the IDS row carries
  // through to the next meeting + any reporting, then bumps the rock
  // to off_track so the visual status matches "we're discussing this".
  // The rock's serviceId carries onto the issue so service-scoped
  // meeting views see it.
  const handleSendRockToIDS = useCallback(
    (rock: { id: string; title: string; serviceId?: string | null }) => {
      createIssue.mutate({
        title: `Rock off-track: ${rock.title}`,
        priority: "high",
        rockId: rock.id,
        serviceId: rock.serviceId ?? undefined,
      });
      updateRock.mutate({ id: rock.id, status: "off_track" });
    },
    [createIssue, updateRock],
  );

  /**
   * Record a scorecard figure against a specific week.
   *
   * The week is passed in rather than assumed to be this one: numbers
   * arrive late — an activation nobody had counted, a correction — and
   * the L10 is where that gets noticed. Defaulting to the current week
   * would file the fix against the wrong one.
   */
  const handleScorecardEntry = useCallback(
    (measurableId: string, value: number, weekOf?: string) => {
      createEntry.mutate({
        measurableId,
        value,
        weekOf: weekOf ?? getWeekStart().toISOString(),
      });
    },
    [createEntry]
  );

  const handleUpdatePriority = useCallback(
    (id: string, priority: string) => {
      updateIssue.mutate({ id, priority: priority as any });
    },
    [updateIssue]
  );

  const handleUpdateDescription = useCallback(
    (id: string, description: string) => {
      updateIssue.mutate({ id, description });
    },
    [updateIssue]
  );

  const handleToggleAttendance = useCallback(
    (userId: string, status: "present" | "absent") => {
      updateMeeting.mutate({
        id: meeting.id,
        attendeeUpdates: [{ userId, status }],
      });
    },
    [meeting.id, updateMeeting]
  );

  const handleAttendeeRate = useCallback(
    (userId: string, ratingVal: number) => {
      setAttendeeRatings((prev) => ({ ...prev, [userId]: ratingVal }));
    },
    []
  );

  const isCompleted = meeting.status === "completed";
  const SectionIcon = section.icon;

  // Surface mic-permission / unsupported-browser errors as toasts.
  const recorderError = recorder.error;
  useEffect(() => {
    if (recorderError) {
      toast({ variant: "destructive", description: recorderError });
    }
  }, [recorderError]);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Top Bar */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => {
            saveProgress();
            onBack();
          }}
          className="p-2 rounded-lg border border-border text-muted hover:text-foreground hover:border-border transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-foreground truncate">
            {meeting.title}
          </h2>
          <p className="text-xs text-muted">
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
        {/* Recording controls — the on-screen indicator is the consent
            surface; the runner also announces recording verbally. */}
        {!isCompleted && canRecord && (
          recorder.isRecording ? (
            <button
              onClick={recorder.stop}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
              </span>
              REC {String(Math.floor(recorder.elapsedSeconds / 60)).padStart(2, "0")}:
              {String(recorder.elapsedSeconds % 60).padStart(2, "0")}
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => {
                recorder.start();
              }}
              title="Record this meeting — audio is transcribed then deleted; the AI review lands on the meeting afterwards"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-border text-muted hover:text-foreground hover:border-red-300 transition-colors"
            >
              <Mic className="w-4 h-4" />
              Record
            </button>
          )
        )}
        {isCompleted ? (
          <span className="text-xs px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-medium">
            Completed
          </span>
        ) : (
          <button
            onClick={() => setShowEndConfirm(true)}
            disabled={currentSection !== 6}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              currentSection === 6
                ? "bg-brand text-white hover:bg-brand-hover shadow-sm"
                : "bg-surface text-muted cursor-not-allowed"
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
                      : "bg-border"
                  )}
                />
                <div
                  className={cn(
                    "flex items-center gap-1 mt-1.5 justify-center",
                    isActive
                      ? "text-brand"
                      : isPast
                      ? "text-brand/50"
                      : "text-muted"
                  )}
                >
                  <Icon className="w-3 h-3" />
                  <span className="text-2xs font-medium hidden lg:inline">
                    {s.label}
                  </span>
                </div>
                {/* Tooltip on hover */}
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                  <div className="bg-foreground text-card text-xs px-2 py-1 rounded whitespace-nowrap">
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
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {/* Section Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-surface/30">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center bg-card border border-border"
                )}
              >
                <SectionIcon className={cn("w-4 h-4", section.color)} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {currentSection + 1}. {section.label}
                </h3>
                <p className="text-xs text-muted">
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
                      : "text-foreground/80"
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
                      ? "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50"
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
              <>
                <AiAgendaPanel
                  part="summary"
                  draft={meeting.aiAgendaDraft}
                  onGenerate={
                    isCompleted ? undefined : () => prepareMeeting.mutate(meeting.id)
                  }
                  generating={prepareMeeting.isPending}
                />
                <SegueSection notes={segueNotes} onUpdate={setSegueNotes} />
              </>
            )}
            {currentSection === 1 && (
              <>
                <AiAgendaPanel part="scorecard" draft={meeting.aiAgendaDraft} />
                <ScorecardSection
                  scorecard={filteredScorecard}
                  onDropToIDS={isCompleted ? undefined : handleDropToIDS}
                  onEntrySubmit={isCompleted ? undefined : handleScorecardEntry}
                  isCompleted={isCompleted}
                />
              </>
            )}
            {currentSection === 2 && (
              <>
                <AiAgendaPanel part="rocks" draft={meeting.aiAgendaDraft} />
                <RockReviewSection
                rocks={rocks}
                onSendToIDS={isCompleted ? undefined : handleSendRockToIDS}
                sendingRockIdToIDS={
                  createIssue.isPending &&
                  (createIssue.variables as { rockId?: string } | undefined)
                    ?.rockId
                    ? ((createIssue.variables as { rockId?: string }).rockId ??
                      null)
                    : null
                }
                />
              </>
            )}
            {currentSection === 3 && (
              <HeadlinesSection headlines={headlines} onUpdate={setHeadlines} />
            )}
            {currentSection === 4 && (
              <TodoReviewSection
                todos={todos}
                onToggle={handleTodoToggle}
                attendees={meeting.attendees}
                users={users}
                onQuickAdd={handleQuickAddTodo}
                onReassign={handleReassignTodo}
                onRedate={handleRedateTodo}
                isCompleted={isCompleted}
                lastMeetingId={lastMeetingId}
              />
            )}
            {currentSection === 5 && (
              <>
                <AiAgendaPanel part="ids" draft={meeting.aiAgendaDraft} />
                <IDSSection
                  issues={allIDSIssues}
                  onUpdateStatus={handleIssueStatus}
                  onCreateIssue={handleCreateIssue}
                  onCreateTodo={handleCreateTodoFromIssue}
                  onUpdatePriority={handleUpdatePriority}
                  onUpdateDescription={handleUpdateDescription}
                  onDropToLongTerm={handleDropToLongTerm}
                  users={users}
                />
              </>
            )}
            {currentSection === 6 && (
              <ConcludeSection
                notes={concludeNotes}
                onUpdate={setConcludeNotes}
                cascadeMessages={cascadeMessages}
                onUpdateCascade={setCascadeMessages}
                rating={rating}
                onRate={setRating}
                attendees={meeting.attendees}
                attendeeRatings={attendeeRatings}
                onAttendeeRate={isCompleted ? undefined : handleAttendeeRate}
              />
            )}
          </div>

          {/* Navigation Footer */}
          {!isCompleted && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-border/50 bg-surface/30">
              <button
                onClick={goPrev}
                disabled={currentSection === 0}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                  currentSection === 0
                    ? "text-muted/50 cursor-not-allowed"
                    : "text-muted hover:bg-surface"
                )}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-xs text-muted">
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
                  onClick={() => setShowEndConfirm(true)}
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
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50 bg-surface/30">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">
                Agenda
              </h3>
            </div>
            <div className="divide-y divide-border/30">
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
                        : "hover:bg-surface"
                    )}
                  >
                    <div
                      className={cn(
                        "w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold",
                        isActive
                          ? "bg-brand text-white"
                          : isPast
                          ? "bg-brand/20 text-brand"
                          : "bg-surface text-muted"
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
                            ? "text-muted"
                            : "text-foreground/80"
                        )}
                      >
                        {s.label}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-2xs font-medium",
                        isActive ? "text-brand" : "text-muted"
                      )}
                    >
                      {s.duration}m
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="px-4 py-2.5 border-t border-border/50 bg-surface/30">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Total</span>
                <span className="text-xs font-semibold text-foreground/80">
                  {L10_SECTIONS.reduce((sum, s) => sum + s.duration, 0)} min
                </span>
              </div>
            </div>
          </div>

          {/* Attendees Panel */}
          {meeting.attendees && meeting.attendees.length > 0 && (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border/50 bg-surface/30 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">
                  Attendees
                </h3>
                <span className="text-xs text-muted">
                  {meeting.attendees.filter((a) => a.status === "present").length}/{meeting.attendees.length} present
                </span>
              </div>
              <div className="divide-y divide-border/30">
                {meeting.attendees.map((attendee) => (
                  <div
                    key={attendee.id}
                    className="flex items-center gap-2.5 px-4 py-2"
                  >
                    {attendee.status === "present" ? (
                      <UserCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <UserX className="w-4 h-4 text-red-400 flex-shrink-0" />
                    )}
                    <span className={cn(
                      "text-sm flex-1 min-w-0 truncate",
                      attendee.status === "present" ? "text-foreground/80" : "text-muted line-through"
                    )}>
                      {attendee.user.name}
                    </span>
                    {!isCompleted && (
                      <button
                        onClick={() =>
                          handleToggleAttendance(
                            attendee.userId,
                            attendee.status === "present" ? "absent" : "present"
                          )
                        }
                        className={cn(
                          "text-2xs px-2 py-0.5 rounded-full font-medium transition-colors",
                          attendee.status === "present"
                            ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-red-100 dark:hover:bg-red-950/50 hover:text-red-700"
                            : "bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 hover:text-emerald-700"
                        )}
                      >
                        {attendee.status === "present" ? "Present" : "Absent"}
                      </button>
                    )}
                    {isCompleted && (
                      <span className={cn(
                        "text-2xs px-2 py-0.5 rounded-full font-medium",
                        attendee.status === "present"
                          ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300"
                          : "bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400"
                      )}>
                        {attendee.status === "present" ? "Present" : "Absent"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Outcomes (completed) or Quick Stats (in progress) */}
          {isCompleted ? (
            <MeetingOutcomesPanel
              meeting={meeting}
              rocks={rocks}
              todos={todos}
              issues={allIDSIssues}
            />
          ) : (
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">
                Quick Stats
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Rocks on track</span>
                  <span className="text-xs font-semibold text-foreground/80">
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
                  <span className="text-xs text-muted">To-dos done</span>
                  <span className="text-xs font-semibold text-foreground/80">
                    {todos
                      ? `${
                          todos.filter((t) => t.status === "complete").length
                        }/${todos.length}`
                      : "--"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Open issues</span>
                  <span className="text-xs font-semibold text-foreground/80">
                    {allIDSIssues.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Scorecard items</span>
                  <span className="text-xs font-semibold text-foreground/80">
                    {filteredScorecard ? filteredScorecard.measurables.length : "--"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* AI meeting review — recordings, transcripts, proposed action
              items (Phase 2, 2026-08-31) */}
          <MeetingAiReviewPanel
            meetingId={meeting.id}
            attendees={meeting.attendees}
            users={users}
            canManage={canRecord}
          />
        </div>
      </div>

      <ConfirmDialog
        open={showEndConfirm}
        onOpenChange={setShowEndConfirm}
        title="End Meeting"
        description="Are you sure you want to end this meeting? This cannot be undone."
        confirmLabel="End Meeting"
        variant="danger"
        onConfirm={() => {
          setShowEndConfirm(false);
          handleComplete();
        }}
        loading={updateMeeting.isPending}
      />
    </div>
  );
}

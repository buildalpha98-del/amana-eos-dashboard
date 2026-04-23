"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Pause,
  Play,
  UserCheck,
  UserX,
} from "lucide-react";
import { useUpdateMeeting } from "@/hooks/useMeetings";
import { useScorecard, useCreateEntry } from "@/hooks/useScorecard";
import { useRocks } from "@/hooks/useRocks";
import { useTodos, useUpdateTodo, useCreateTodo } from "@/hooks/useTodos";
import { useIssues, useUpdateIssue, useCreateIssue } from "@/hooks/useIssues";
import type { MeetingData } from "@/hooks/useMeetings";
import { useServices } from "@/hooks/useServices";
import { cn, formatDateAU, getWeekStart, getCurrentQuarter } from "@/lib/utils";
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

export function ActiveMeetingView({
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
  const updateTodo = useUpdateTodo();
  const updateIssue = useUpdateIssue();
  const createIssue = useCreateIssue();
  const createTodo = useCreateTodo();
  const createEntry = useCreateEntry();

  // Data hooks
  const { data: scorecard } = useScorecard();
  const { data: allRocks } = useRocks(getCurrentQuarter());
  const weekStart = getWeekStart();
  const { data: allTodos } = useTodos({ weekOf: weekStart.toISOString() });
  const { data: allIDSIssuesRaw } = useIssues({ status: "open,in_discussion" });
  const { data: services } = useServices("active");
  const { data: users } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["users-list"],
    queryFn: () => fetchApi<{ id: string; name: string }[]>("/api/users"),
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

  // Filter todos by service scope
  const todos = useMemo(() => {
    if (!allTodos) return undefined;
    if (!hasServiceScope) return allTodos;
    return allTodos.filter(
      (t) => !t.serviceId || meetingServiceIds.includes(t.serviceId)
    );
  }, [allTodos, hasServiceScope, meetingServiceIds]);

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
    (title: string, priority?: string) => {
      createIssue.mutate({
        title,
        priority: (priority || "medium") as any,
        serviceId: meetingServiceIds.length === 1 ? meetingServiceIds[0] : undefined,
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
        dueDate: new Date(ws.getTime() + 6 * 86400000).toISOString().split("T")[0],
        weekOf: ws.toISOString(),
      });
    },
    [createTodo, meetingServiceIds]
  );

  const handleDropToIDS = useCallback(
    (title: string) => {
      createIssue.mutate({ title, priority: "high" });
    },
    [createIssue]
  );

  const handleScorecardEntry = useCallback(
    (measurableId: string, value: number) => {
      const weekOf = getWeekStart().toISOString();
      createEntry.mutate({ measurableId, value, weekOf });
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
        {isCompleted ? (
          <span className="text-xs px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">
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
                  <span className="text-[10px] font-medium hidden lg:inline">
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
              <ScorecardSection
                scorecard={filteredScorecard}
                onDropToIDS={isCompleted ? undefined : handleDropToIDS}
                onEntrySubmit={isCompleted ? undefined : handleScorecardEntry}
                isCompleted={isCompleted}
              />
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
                onUpdatePriority={handleUpdatePriority}
                onUpdateDescription={handleUpdateDescription}
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
                        "text-[10px] font-medium",
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
                          "text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors",
                          attendee.status === "present"
                            ? "bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700"
                            : "bg-red-100 text-red-600 hover:bg-emerald-100 hover:text-emerald-700"
                        )}
                      >
                        {attendee.status === "present" ? "Present" : "Absent"}
                      </button>
                    )}
                    {isCompleted && (
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-medium",
                        attendee.status === "present"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-600"
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

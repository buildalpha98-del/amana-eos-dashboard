"use client";

import { useState } from "react";
import {
  useMeetings,
  useCreateMeeting,
} from "@/hooks/useMeetings";
import { useCreateMeetingSeries } from "@/hooks/useMeetingSeries";
import type { MeetingData } from "@/hooks/useMeetings";
import { formatDateAU } from "@/lib/utils";
import { ErrorState } from "@/components/ui/ErrorState";
import { MeetingListView } from "@/components/meetings/MeetingListView";
import { ActiveMeetingView } from "@/components/meetings/ActiveMeetingView";
import { StartMeetingDialog } from "@/components/meetings/StartMeetingDialog";

// ============================================================
// Main Page Component
// ============================================================

export default function MeetingsPage() {
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [showStartDialog, setShowStartDialog] = useState(false);

  const { data: meetings, isLoading, error, refetch } = useMeetings({ limit: 100 });
  const createMeeting = useCreateMeeting();
  const createSeries = useCreateMeetingSeries();

  const activeMeeting = meetings?.find((m) => m.id === activeMeetingId);

  const handleStartNew = () => {
    setShowStartDialog(true);
  };

  const handleConfirmStart = async (
    serviceIds: string[],
    attendeeIds: string[],
    isLeadership: boolean,
    scorecardId: string | null,
    scheduledFor: string | null,
    repeatWeekly: boolean,
  ) => {
    const now = new Date();
    // 2026-07-28: title reflects the meeting type so the list is scannable.
    // Scheduled meetings are titled by their scheduled date, not today.
    const titleDate = scheduledFor ? new Date(scheduledFor) : now;
    const title = isLeadership
      ? `Leadership L10 — ${formatDateAU(titleDate)}`
      : `L10 Meeting — ${formatDateAU(titleDate)}`;
    try {
      // Repeat-weekly: create the series first (from the picked LOCAL
      // wall-clock time — the series is timezone-anchored so DST never
      // shifts it), then this week's meeting stamped with its id. If the
      // meeting create fails, the orphan series is harmless — the daily
      // cron simply materialises next week's occurrence.
      let seriesId: string | undefined;
      if (repeatWeekly && scheduledFor) {
        const local = new Date(scheduledFor);
        const series = await createSeries.mutateAsync({
          name: isLeadership ? "Leadership L10" : "L10 Meeting",
          dayOfWeek: local.getDay(),
          minuteOfDay: local.getHours() * 60 + local.getMinutes(),
          timezone: "Australia/Sydney",
          isLeadership,
          serviceIds,
          scorecardId,
          attendeeUserIds: attendeeIds,
        });
        seriesId = series.id;
      }

      const newMeeting = await createMeeting.mutateAsync({
        title,
        date: now.toISOString(),
        serviceIds,
        attendeeIds: attendeeIds.length > 0 ? attendeeIds : undefined,
        isLeadership,
        scorecardId,
        ...(scheduledFor ? { scheduledFor } : {}),
        ...(seriesId ? { seriesId } : {}),
      });
      setShowStartDialog(false);
      // Scheduled meetings stay on the list (nothing to run yet);
      // start-now opens the meeting runner immediately.
      if (!scheduledFor) {
        setActiveMeetingId(newMeeting.id);
      }
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
    // Previous completed meeting of the same kind (leadership flag +
    // overlapping service scope; both empty counts as overlap) — feeds
    // the To-Do Review "from last meeting" carry-over badge.
    const lastMeeting = (meetings ?? [])
      .filter(
        (m) =>
          m.status === "completed" &&
          m.id !== activeMeeting.id &&
          m.isLeadership === activeMeeting.isLeadership &&
          (activeMeeting.serviceIds.length === 0
            ? m.serviceIds.length === 0
            : m.serviceIds.some((s) => activeMeeting.serviceIds.includes(s))),
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    return (
      <ActiveMeetingView
        meeting={activeMeeting}
        onBack={() => setActiveMeetingId(null)}
        lastMeetingId={lastMeeting?.id ?? null}
      />
    );
  }

  return (
    <div data-v2="staff">
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
    </div>
  );
}

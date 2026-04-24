"use client";

import { useState } from "react";
import {
  useMeetings,
  useCreateMeeting,
} from "@/hooks/useMeetings";
import type { MeetingData } from "@/hooks/useMeetings";
import { formatDateAU } from "@/lib/utils";
import { ErrorState } from "@/components/ui/ErrorState";
import { MeetingListView } from "@/components/meetings/MeetingListView";
import { ActiveMeetingView } from "@/components/meetings/ActiveMeetingView";
import { StartMeetingDialog } from "@/components/meetings/StartMeetingDialog";
import { useStaffV2Flag } from "@/lib/useStaffV2Flag";

// ============================================================
// Main Page Component
// ============================================================

export default function MeetingsPage() {
  const v2 = useStaffV2Flag();
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [showStartDialog, setShowStartDialog] = useState(false);

  const { data: meetings, isLoading, error, refetch } = useMeetings({ limit: 100 });
  const createMeeting = useCreateMeeting();

  const activeMeeting = meetings?.find((m) => m.id === activeMeetingId);

  const handleStartNew = () => {
    setShowStartDialog(true);
  };

  const handleConfirmStart = async (serviceIds: string[], attendeeIds: string[]) => {
    const now = new Date();
    const title = `L10 Meeting — ${formatDateAU(now)}`;
    try {
      const newMeeting = await createMeeting.mutateAsync({
        title,
        date: now.toISOString(),
        serviceIds,
        attendeeIds: attendeeIds.length > 0 ? attendeeIds : undefined,
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
    <div {...(v2 ? { "data-v2": "staff" } : {})}>
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

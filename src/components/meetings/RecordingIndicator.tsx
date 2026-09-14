"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatElapsed } from "@/lib/recording-capture";
import { useElapsedSeconds, useMeetingRecorder } from "./MeetingRecorderProvider";

/**
 * Always-visible recording state (Recorder v2). Mounted by the dashboard
 * layout so it follows the user to every page; the recorder itself lives
 * in MeetingRecorderProvider and does not care where the user is.
 */
export function RecordingIndicator() {
  const { status, startedAt, stop } = useMeetingRecorder();
  // The once-a-second tick lives here, not in the provider, so the layout
  // shell and the other consumers don't re-render for 90 minutes.
  const elapsedSeconds = useElapsedSeconds(startedAt);
  const pathname = usePathname();
  const onMeetingsPage = pathname === "/meetings";

  return (
    <>
      {/* Always mounted so screen readers get one announcement per state
          change (a live region only announces when it exists before the text
          changes). The ticking timer is hidden from AT so it isn't re-read
          every second. */}
      <span className="sr-only" role="status">
        {status === "recording" ? "Recording in progress" : status === "uploading" ? "Uploading recording" : ""}
      </span>
      {status !== "idle" && (
        <div className="fixed z-50 right-6 bottom-36 md:bottom-20 flex items-center gap-2 rounded-full border border-border bg-card shadow-lg pl-3 pr-2 py-1.5">
          {status === "recording" ? (
            <>
              <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
              </span>
              <span className="text-xs font-semibold tabular-nums text-foreground" aria-hidden="true">
                REC {formatElapsed(elapsedSeconds)}
              </span>
              {!onMeetingsPage && (
                <Link href="/meetings" className="text-xs text-brand hover:underline">
                  Back to meeting
                </Link>
              )}
              <Button
                variant="destructive"
                size="xs"
                onClick={() => void stop()}
                aria-label="Stop recording"
                iconLeft={<Square className="w-3 h-3" />}
              >
                Stop
              </Button>
            </>
          ) : (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted" aria-hidden="true" />
              <span className="text-xs text-muted" aria-hidden="true">Uploading recording…</span>
            </>
          )}
        </div>
      )}
    </>
  );
}

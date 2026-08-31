import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { generateMeetingReview } from "@/lib/meeting-review";
import { sendMeetingDigestSafe } from "@/lib/meeting-digest";

// Inline Sonnet call — give the platform enough runway.
export const maxDuration = 120;

/**
 * POST /api/meetings/[id]/recordings/[recordingId]/regenerate
 *
 * Re-run summarisation from the STORED transcript (free to redo — the
 * audio is long gone by design). Claims the row via a status-guarded
 * updateMany so two concurrent regenerates can't both burn a Sonnet call.
 */
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id, recordingId } = (await context!.params!) as {
      id: string;
      recordingId: string;
    };

    const recording = await prisma.meetingRecording.findUnique({
      where: { id: recordingId },
      select: { id: true, meetingId: true, transcript: true, status: true },
    });
    if (!recording || recording.meetingId !== id) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }
    if (!recording.transcript) {
      return NextResponse.json(
        { error: "Recording has no transcript to summarise" },
        { status: 409 },
      );
    }

    const claimed = await prisma.meetingRecording.updateMany({
      where: { id: recordingId, status: { in: ["complete", "failed"] } },
      data: { status: "transcribed", error: null },
    });
    if (claimed.count === 0) {
      return NextResponse.json(
        { error: "Recording is still processing" },
        { status: 409 },
      );
    }

    try {
      const review = await generateMeetingReview(recordingId);
      const updated = await prisma.meetingRecording.update({
        where: { id: recordingId },
        data: { aiReview: review as object, status: "complete" },
      });
      // No-op if the digest already went out for this recording.
      sendMeetingDigestSafe(recordingId);
      return NextResponse.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.meetingRecording.update({
        where: { id: recordingId },
        data: { status: "failed", error: message },
      });
      logger.error("recordings: regenerate failed", { recordingId, err: message });
      return NextResponse.json(
        { error: "Review generation failed" },
        { status: 502 },
      );
    }
  },
  {
    roles: ["owner", "head_office", "admin", "marketing", "eos_implementer"],
    rateLimit: { max: 5, windowMs: 60_000 },
    timeoutMs: 120_000,
  },
);

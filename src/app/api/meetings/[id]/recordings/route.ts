import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { deleteFile } from "@/lib/storage";
import { logger } from "@/lib/logger";
import {
  buildDeepgramCallbackUrl,
  requestTranscription,
} from "@/lib/deepgram";

/**
 * Meeting recordings (Phase 2, 2026-08-31).
 *
 * POST registers an already-uploaded audio/video blob against a meeting and
 * asks Deepgram to transcribe it (async — the transcript arrives via
 * /api/webhooks/deepgram). The raw audio is deleted after transcription;
 * the transcript is the durable record.
 */

const createRecordingSchema = z.object({
  url: z.string().url(),
  source: z.enum(["live_mic", "upload"]),
  durationSeconds: z.number().int().positive().optional(),
});

const MEETING_ROLES = [
  "owner",
  "head_office",
  "admin",
  "marketing",
  "eos_implementer",
] as const;

// POST /api/meetings/[id]/recordings
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const parsed = createRecordingSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    // Only our own blob store — never register (or later delete) an
    // arbitrary URL. Same rule as /api/upload/verify.
    const host = new URL(parsed.data.url).hostname;
    if (!host.endsWith(".blob.vercel-storage.com")) {
      return NextResponse.json(
        { error: "Not a blob-storage URL" },
        { status: 400 },
      );
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const recording = await prisma.meetingRecording.create({
      data: {
        meetingId: id,
        source: parsed.data.source,
        status: "uploaded",
        audioBlobUrl: parsed.data.url,
        durationSeconds: parsed.data.durationSeconds ?? null,
        createdById: session!.user.id,
      },
    });

    try {
      const { requestId } = await requestTranscription({
        audioUrl: parsed.data.url,
        callbackUrl: buildDeepgramCallbackUrl(),
      });
      const updated = await prisma.meetingRecording.update({
        where: { id: recording.id },
        data: { deepgramRequestId: requestId, status: "transcribing" },
      });
      return NextResponse.json(updated, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.meetingRecording.update({
        where: { id: recording.id },
        data: { status: "failed", error: message },
      });
      // Null the URL only after a successful delete — janitor sweep e3
      // retries terminal rows that still carry one.
      try {
        await deleteFile(parsed.data.url);
        await prisma.meetingRecording.update({
          where: { id: recording.id },
          data: { audioBlobUrl: null },
        });
      } catch (delErr) {
        logger.warn("recordings: could not delete blob after Deepgram failure", {
          recordingId: recording.id,
          err: delErr instanceof Error ? delErr.message : String(delErr),
        });
      }
      logger.error("recordings: Deepgram transcription request failed", {
        recordingId: recording.id,
        err: message,
      });
      return NextResponse.json(
        { error: "Transcription request failed" },
        { status: 502 },
      );
    }
  },
  { roles: [...MEETING_ROLES], rateLimit: { max: 10, windowMs: 60_000 } },
);

// GET /api/meetings/[id]/recordings — list (transcript Json excluded; the
// flat transcriptText + aiReview are what the UI renders)
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const recordings = await prisma.meetingRecording.findMany({
    where: { meetingId: id },
    select: {
      id: true,
      meetingId: true,
      source: true,
      status: true,
      durationSeconds: true,
      transcriptText: true,
      aiReview: true,
      error: true,
      createdById: true,
      createdBy: { select: { id: true, name: true } },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(recordings);
});

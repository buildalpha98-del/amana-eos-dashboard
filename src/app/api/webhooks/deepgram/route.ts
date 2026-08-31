import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { deleteFile } from "@/lib/storage";
import {
  buildTranscriptText,
  extractRequestId,
  extractUtterances,
  type DeepgramCallbackPayload,
} from "@/lib/deepgram";
import { generateMeetingReview } from "@/lib/meeting-review";

// The inline Sonnet summarisation is the long pole.
export const maxDuration = 120;

/**
 * POST /api/webhooks/deepgram?secret=...
 *
 * Deepgram's async transcription callback. Auth is a shared secret
 * compared in constant time (same pattern as /api/webhooks/brevo).
 *
 * Flow: guarded claim (transcribing → transcribed, transcript folded into
 * the SAME write so a crash can never leave a transcript-less row) →
 * delete the audio blob (privacy: transcript is the durable record) →
 * summarise inline → complete. Duplicate deliveries no-op on the claim.
 */

function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const POST = withApiHandler(
  async (req) => {
    const expected = process.env.DEEPGRAM_WEBHOOK_SECRET;
    if (!expected) {
      logger.error("DEEPGRAM_WEBHOOK_SECRET not configured");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
    }
    const { searchParams } = new URL(req.url);
    if (!secretMatches(searchParams.get("secret"), expected)) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    }

    let payload: DeepgramCallbackPayload;
    try {
      payload = (await req.json()) as DeepgramCallbackPayload;
    } catch {
      return NextResponse.json({ received: true }); // malformed → ack, don't retry-loop
    }

    const requestId = extractRequestId(payload);
    if (!requestId) {
      logger.warn("deepgram webhook: payload carried no request_id");
      return NextResponse.json({ received: true });
    }

    const recording = await prisma.meetingRecording.findFirst({
      where: { deepgramRequestId: requestId },
      select: { id: true, audioBlobUrl: true, durationSeconds: true },
    });
    if (!recording) {
      // Ack so Deepgram doesn't retry forever; a request we didn't make
      // (or a long-dead row) isn't actionable.
      logger.warn("deepgram webhook: unknown request_id", { requestId });
      return NextResponse.json({ received: true });
    }

    const utterances = extractUtterances(payload);

    // A callback with no speech at all is a failed/empty transcription —
    // never summarise emptiness.
    if (utterances.length === 0) {
      await prisma.meetingRecording.updateMany({
        where: { id: recording.id, status: "transcribing" },
        data: {
          status: "failed",
          error: "Transcription returned no speech",
          audioBlobUrl: null,
        },
      });
      if (recording.audioBlobUrl) {
        await deleteFile(recording.audioBlobUrl).catch((err) =>
          logger.warn("deepgram webhook: blob delete failed (empty result)", {
            recordingId: recording.id,
            err: err instanceof Error ? err.message : String(err),
          }),
        );
      }
      return NextResponse.json({ received: true });
    }

    // Guarded claim: transcript folded into the SAME status write so a
    // crash after this point can never strand a transcript-less
    // `transcribed` row. Count 0 ⇒ duplicate delivery (or a janitor-failed
    // row) — no-op.
    const claimed = await prisma.meetingRecording.updateMany({
      where: { id: recording.id, status: "transcribing" },
      data: {
        status: "transcribed",
        transcript: utterances as unknown as object[],
        transcriptText: buildTranscriptText(utterances),
        ...(recording.durationSeconds == null && payload.metadata?.duration
          ? { durationSeconds: Math.round(payload.metadata.duration) }
          : {}),
      },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    // Privacy: delete the audio now that the transcript is safely stored.
    // Failure is non-fatal — the janitor sweeps leftovers.
    if (recording.audioBlobUrl) {
      try {
        await deleteFile(recording.audioBlobUrl);
        await prisma.meetingRecording.update({
          where: { id: recording.id },
          data: { audioBlobUrl: null },
        });
      } catch (err) {
        logger.warn("deepgram webhook: blob delete failed", {
          recordingId: recording.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    try {
      const review = await generateMeetingReview(recording.id);
      await prisma.meetingRecording.update({
        where: { id: recording.id },
        data: { aiReview: review as object, status: "complete" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.meetingRecording.update({
        where: { id: recording.id },
        data: { status: "failed", error: message },
      });
      logger.error("deepgram webhook: summarisation failed", {
        recordingId: recording.id,
        err: message,
      });
      // Transcript is retained — Regenerate can retry without re-transcribing.
    }

    return NextResponse.json({ received: true });
  },
  { timeoutMs: 120_000 },
);

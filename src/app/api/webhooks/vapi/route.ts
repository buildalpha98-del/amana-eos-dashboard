/**
 * VAPI End-of-Call Webhook
 *
 * Receives call reports from VAPI, parses the transcript for structured data,
 * stores the call record, and fires off parent follow-up and internal notification emails.
 *
 * Supports both legacy payload format (nested under `message`) and current
 * format (top-level fields + `artifact` object).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { parseCallData } from "@/lib/vapi/parseTranscript";
import { sendParentFollowUpEmail } from "@/lib/vapi/sendCallEmail";
import { sendInternalNotification } from "@/lib/vapi/sendInternalNotification";

/**
 * Normalise the incoming VAPI payload into a consistent shape regardless of
 * whether VAPI sends the legacy `{ message: { type, call, ... } }` format or
 * the current `{ type, call, artifact: { transcript, messages, recordingUrl } }` format.
 */
function normalisePayload(body: Record<string, unknown>): {
  type: string | undefined;
  call: Record<string, unknown> | undefined;
  transcript: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[];
  recordingUrl: string | undefined;
  structuredData: Record<string, unknown> | undefined;
} {
  // Legacy format: everything nested under `message`
  const message = body.message as Record<string, unknown> | undefined;
  // Current format: `artifact` holds transcript, messages, recordingUrl
  const artifact = (body.artifact ?? message?.artifact) as Record<string, unknown> | undefined;
  // Analysis holds post-call structured data extraction
  const analysis = (body.analysis ?? message?.analysis) as Record<string, unknown> | undefined;

  const type = (message?.type ?? body.type) as string | undefined;
  const call = (message?.call ?? body.call) as Record<string, unknown> | undefined;

  // Transcript: try artifact first, then top-level / message-level
  const transcript =
    (artifact?.transcript as string) ??
    (message?.transcript as string) ??
    (body.transcript as string) ??
    "";

  // Messages array: try artifact first, then top-level / message-level
  const messages =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (artifact?.messages as any[]) ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (message?.messages as any[]) ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (body.messages as any[]) ??
    [];

  // Recording URL
  const recordingUrl =
    (artifact?.recordingUrl as string) ??
    (message?.recordingUrl as string) ??
    (body.recordingUrl as string) ??
    undefined;

  // Structured data from Vapi's analysisPlan (post-call extraction)
  const structuredData =
    (analysis?.structuredData as Record<string, unknown>) ??
    undefined;

  return { type, call, transcript, messages, recordingUrl, structuredData };
}

/** Health check — lets the team verify the endpoint is live and the secret is configured. */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    secretConfigured: !!process.env.VAPI_WEBHOOK_SECRET,
  });
}

export async function POST(request: Request) {
  // Verify webhook secret
  const secret = request.headers.get("x-vapi-secret");
  if (secret !== process.env.VAPI_WEBHOOK_SECRET) {
    logger.warn("VAPI webhook auth failed", {
      hasSecret: !!secret,
      hasEnvSecret: !!process.env.VAPI_WEBHOOK_SECRET,
    });
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, call, transcript, messages, recordingUrl, structuredData } = normalisePayload(body);

  // Log every incoming webhook type for diagnostics
  logger.info("VAPI webhook received", {
    type: type ?? "unknown",
    hasCall: !!call,
    hasTranscript: !!transcript,
    hasMessages: messages.length > 0,
    hasStructuredData: !!structuredData,
    bodyKeys: Object.keys(body),
  });

  // Only process end-of-call reports
  if (type !== "end-of-call-report") {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    const vapiCallId = (call?.id as string) ?? undefined;
    const startedAt = call?.startedAt as string | undefined;
    const endedAt = call?.endedAt as string | undefined;

    let callDurationSeconds: number | undefined;
    if (startedAt && endedAt) {
      callDurationSeconds = Math.round(
        (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000,
      );
    }

    const calledAt = startedAt ? new Date(startedAt) : new Date();
    const parsed = parseCallData(transcript, messages, structuredData);

    logger.info("VAPI call parsed", {
      vapiCallId,
      callType: parsed.callType,
      urgency: parsed.urgency,
      parentName: parsed.parentName,
      centreName: parsed.centreName,
      transcriptLength: transcript.length,
      source: structuredData ? "analysis" : "transcript",
    });

    const created = await prisma.vapiCall.create({
      data: {
        vapiCallId,
        callType: parsed.callType,
        urgency: parsed.urgency,
        callDetails: parsed.callDetails as Record<string, unknown> as Prisma.InputJsonValue,
        parentName: parsed.parentName,
        parentPhone: parsed.parentPhone,
        parentEmail: parsed.parentEmail,
        childName: parsed.childName,
        centreName: parsed.centreName,
        transcript: transcript || undefined,
        recordingUrl,
        callDurationSeconds,
        calledAt,
      },
    });

    // Fire and forget — email errors must not affect the 200 response
    sendParentFollowUpEmail(created.id).catch((err) =>
      logger.error("VAPI parent email failed", { callId: created.id, error: err }),
    );
    sendInternalNotification(created.id).catch((err) =>
      logger.error("VAPI internal notification failed", { callId: created.id, error: err }),
    );

    return NextResponse.json({ received: true, callId: created.id }, { status: 200 });
  } catch (err) {
    logger.error("VAPI webhook processing error", { error: err });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * VAPI End-of-Call Webhook
 *
 * Receives call reports from VAPI, parses the transcript for structured data,
 * stores the call record, and fires off parent follow-up and internal notification emails.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { parseCallData } from "@/lib/vapi/parseTranscript";
import { sendParentFollowUpEmail } from "@/lib/vapi/sendCallEmail";
import { sendInternalNotification } from "@/lib/vapi/sendInternalNotification";

export async function POST(request: Request) {
  // Verify webhook secret
  const secret = request.headers.get("x-vapi-secret");
  if (secret !== process.env.VAPI_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only process end-of-call reports
  const message = body.message as Record<string, unknown> | undefined;
  if (!message || message.type !== "end-of-call-report") {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    const call = message.call as Record<string, unknown> | undefined;
    const vapiCallId = (call?.id as string) ?? undefined;
    const transcript = (message.transcript as string) ?? "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages = (message.messages as any[]) ?? [];
    const recordingUrl = (message.recordingUrl as string) ?? undefined;
    const startedAt = call?.startedAt as string | undefined;
    const endedAt = call?.endedAt as string | undefined;

    let callDurationSeconds: number | undefined;
    if (startedAt && endedAt) {
      callDurationSeconds = Math.round(
        (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000,
      );
    }

    const calledAt = startedAt ? new Date(startedAt) : new Date();
    const parsed = parseCallData(transcript, messages);

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

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    logger.error("VAPI webhook processing error", { error: err });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

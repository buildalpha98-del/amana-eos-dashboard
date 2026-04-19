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
import { createEnquiryFromCall } from "@/lib/vapi/create-enquiry-from-call";
import { createBookingChangeTodo } from "@/lib/vapi/create-booking-change-todo";
import { sendCallFollowUpSms } from "@/lib/vapi/sendCallSms";

function coerceSuccessEvaluation(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "pass" || v === "success" || v === "successful") return true;
    if (v === "false" || v === "fail" || v === "failure" || v === "unsuccessful") return false;
  }
  return undefined;
}

function normalisePayload(body: Record<string, unknown>): {
  type: string | undefined;
  call: Record<string, unknown> | undefined;
  transcript: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[];
  recordingUrl: string | undefined;
  structuredData: Record<string, unknown> | undefined;
  summary: string | undefined;
  successEvaluation: boolean | undefined;
} {
  const message = body.message as Record<string, unknown> | undefined;
  const artifact = (body.artifact ?? message?.artifact) as Record<string, unknown> | undefined;
  const analysis = (body.analysis ?? message?.analysis) as Record<string, unknown> | undefined;

  const type = (message?.type ?? body.type) as string | undefined;
  const call = (message?.call ?? body.call) as Record<string, unknown> | undefined;

  const transcript =
    (artifact?.transcript as string) ??
    (message?.transcript as string) ??
    (body.transcript as string) ??
    "";

  const messages =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (artifact?.messages as any[]) ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (message?.messages as any[]) ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (body.messages as any[]) ??
    [];

  const recordingUrl =
    (artifact?.recordingUrl as string) ??
    (message?.recordingUrl as string) ??
    (body.recordingUrl as string) ??
    undefined;

  const structuredData = (analysis?.structuredData as Record<string, unknown>) ?? undefined;

  const summaryRaw = analysis?.summary;
  const summary =
    typeof summaryRaw === "string" && summaryRaw.trim() ? summaryRaw.trim() : undefined;

  const successEvaluation = coerceSuccessEvaluation(analysis?.successEvaluation);

  return { type, call, transcript, messages, recordingUrl, structuredData, summary, successEvaluation };
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

  const {
    type,
    call,
    transcript,
    messages,
    recordingUrl,
    structuredData,
    summary,
    successEvaluation,
  } = normalisePayload(body);

  logger.info("VAPI webhook received", {
    type: type ?? "unknown",
    hasCall: !!call,
    hasTranscript: !!transcript,
    hasMessages: messages.length > 0,
    hasStructuredData: !!structuredData,
    hasSummary: !!summary,
    hasSuccessEvaluation: successEvaluation != null,
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

    // Check for repeat caller (same phone in the last 7 days)
    let repeatCaller = false;
    if (parsed.parentPhone) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const prior = await prisma.vapiCall.findFirst({
        where: {
          parentPhone: parsed.parentPhone,
          calledAt: { gte: sevenDaysAgo },
        },
        select: { id: true },
      });
      repeatCaller = !!prior;
    }

    logger.info("VAPI call parsed", {
      vapiCallId,
      callType: parsed.callType,
      urgency: parsed.urgency,
      parentName: parsed.parentName,
      centreName: parsed.centreName,
      transcriptLength: transcript.length,
      source: structuredData ? "analysis" : "transcript",
      repeatCaller,
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
        summary,
        successEvaluation,
        repeatCaller,
        recordingUrl,
        callDurationSeconds,
        calledAt,
      },
    });

    // For new_enquiry calls, auto-create a ParentEnquiry which enrols the parent
    // into the existing nurture sequence (welcome → CCS info → enrolment reminders).
    // We skip the one-off sendParentFollowUpEmail in this case to avoid duplicate
    // welcome emails — the nurture system sends a richer "welcome" step.
    let enquiryCreated = false;
    if (parsed.callType === "new_enquiry") {
      try {
        const enquiryId = await createEnquiryFromCall(created.id);
        enquiryCreated = !!enquiryId;
      } catch (err) {
        logger.error("VAPI: enquiry creation threw", { callId: created.id, error: err });
      }
    }

    // For booking_change calls, auto-create a Todo for the centre coordinator
    // so the change gets processed in OWNA within the SLA window.
    if (parsed.callType === "booking_change") {
      try {
        await createBookingChangeTodo(created.id);
      } catch (err) {
        logger.error("VAPI: booking-change todo creation threw", {
          callId: created.id,
          error: err,
        });
      }
    }

    // Fire and forget — email errors must not affect the 200 response
    if (!enquiryCreated) {
      sendParentFollowUpEmail(created.id).catch((err) =>
        logger.error("VAPI parent email failed", { callId: created.id, error: err }),
      );
    }
    sendInternalNotification(created.id).catch((err) =>
      logger.error("VAPI internal notification failed", { callId: created.id, error: err }),
    );
    sendCallFollowUpSms(created.id).catch((err) =>
      logger.error("VAPI follow-up SMS failed", { callId: created.id, error: err }),
    );

    return NextResponse.json(
      { received: true, callId: created.id, enquiryCreated },
      { status: 200 },
    );
  } catch (err) {
    logger.error("VAPI webhook processing error", { error: err });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Auto-create a ParentEnquiry from a VAPI new_enquiry call and enrol the parent
 * into the existing nurture sequence.
 *
 * Only fires for callType === "new_enquiry". Requires a centre we can resolve to
 * a Service record — if the centre is missing or unrecognised, skips creation
 * (the call still appears in the Calls tab for manual follow-up).
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { scheduleNurtureFromStageChange } from "@/lib/nurture-scheduler";
import { resolveServiceId } from "@/lib/vapi/centre-resolver";

export async function createEnquiryFromCall(callId: string): Promise<string | null> {
  const call = await prisma.vapiCall.findUnique({ where: { id: callId } });
  if (!call) return null;
  if (call.callType !== "new_enquiry") return null;
  if (call.linkedEnquiryId) return call.linkedEnquiryId; // Idempotent
  if (!call.parentName) {
    logger.info("VAPI: skipping enquiry creation — no parent name", { callId });
    return null;
  }

  const serviceId = await resolveServiceId(call.centreName);
  if (!serviceId) {
    logger.info("VAPI: skipping enquiry creation — centre not resolved", {
      callId,
      centreName: call.centreName,
    });
    return null;
  }

  const details = (call.callDetails as Record<string, unknown>) ?? {};
  const childAgeRaw = details.childAge;
  const childAge =
    typeof childAgeRaw === "number"
      ? childAgeRaw
      : typeof childAgeRaw === "string" && /^\d+$/.test(childAgeRaw.trim())
        ? parseInt(childAgeRaw.trim(), 10)
        : null;

  const notesParts = [
    `Auto-created from VAPI call ${call.id}`,
    call.callDurationSeconds ? `Duration: ${call.callDurationSeconds}s` : null,
    details.careType ? `Care type: ${details.careType}` : null,
    details.daysNeeded ? `Days needed: ${details.daysNeeded}` : null,
    details.preferredStart ? `Preferred start: ${details.preferredStart}` : null,
    details.referralSource ? `Source: ${details.referralSource}` : null,
    call.summary ? `Summary: ${call.summary}` : null,
    typeof details.notes === "string" && details.notes ? `Notes: ${details.notes}` : null,
  ].filter(Boolean);

  try {
    const enquiry = await prisma.parentEnquiry.create({
      data: {
        serviceId,
        parentName: call.parentName,
        parentEmail: call.parentEmail ?? null,
        parentPhone: call.parentPhone ?? null,
        childName: call.childName ?? null,
        childAge,
        channel: "phone",
        stage: "new_enquiry",
        notes: notesParts.join("\n"),
      },
    });

    await prisma.vapiCall.update({
      where: { id: call.id },
      data: { linkedEnquiryId: enquiry.id },
    });

    // Fire-and-forget: enrol into nurture sequence. Errors shouldn't block the call webhook.
    scheduleNurtureFromStageChange(enquiry.id, "new").catch((err) =>
      logger.error("VAPI: nurture scheduling failed for auto-created enquiry", {
        callId,
        enquiryId: enquiry.id,
        error: err,
      }),
    );

    logger.info("VAPI: auto-created enquiry from call", {
      callId,
      enquiryId: enquiry.id,
      serviceId,
    });

    return enquiry.id;
  } catch (err) {
    logger.error("VAPI: failed to auto-create enquiry", { callId, error: err });
    return null;
  }
}

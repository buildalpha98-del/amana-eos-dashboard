/**
 * Enquiry stage-transition event log (2026-07-06).
 *
 * Fire-and-forget by design: pipeline history must never fail the
 * write that caused it. Call from every site that sets or changes
 * ParentEnquiry.stage — pass fromStage=null for the creation event.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function logEnquiryStageEvent(
  enquiryId: string,
  fromStage: string | null,
  toStage: string,
): Promise<void> {
  if (fromStage === toStage) return;
  try {
    await prisma.parentEnquiryStageEvent.create({
      data: { enquiryId, fromStage, toStage },
    });
  } catch (err) {
    logger.warn("Stage event log failed", {
      enquiryId,
      toStage,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

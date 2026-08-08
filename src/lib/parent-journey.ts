/**
 * Put portal families into the marketing flow that already exists.
 *
 * WHY: the nurture engine (Sequence / SequenceEnrolment / the nurture-send
 * cron) is driven entirely by `ParentEnquiry.stage`. Everything that
 * arrived through an enquiry — website form, phone call, OWNA sync — gets
 * welcome, CCS help, form support, nudges and the first-session
 * onboarding run. Families who sign up directly in the parent portal
 * touch none of that: they have a ParentAccount and an EnrolmentDraft and
 * no enquiry, so they receive nothing. A family who abandons the form
 * halfway is exactly who the nudges were written for, and they were the
 * one group not getting them.
 *
 * Rather than build a second scheduler, this creates/advances a
 * ParentEnquiry for the portal family and hands off to the existing
 * `scheduleNurtureFromStageChange`. They then appear in the enquiry
 * pipeline, the forecast and the morning briefing too — one funnel, not
 * two.
 *
 * The service is required on an enquiry, so nothing can be scheduled
 * until we know which centre the family is heading to. In practice that's
 * the moment they pick a school in the form, which is also the first
 * moment we'd have anything centre-specific to say.
 *
 * EVERY function here is best-effort. Marketing must never be able to
 * fail a parent's enrolment: callers get a resolved promise regardless,
 * and problems are logged.
 */
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { scheduleNurtureFromStageChange } from "@/lib/nurture-scheduler";
import { logEnquiryStageEvent } from "@/lib/enquiry-stage-events";

/** Stages the portal drives. Others stay the office's to set by hand. */
export type PortalStage = "form_started" | "enrolled" | "first_session";

/**
 * Stage ranking, so a late-arriving event can't walk a family backwards.
 * Draft autosave fires constantly; without this, one save after approval
 * would drop an enrolled family back into the nudge sequence.
 */
const RANK: Record<string, number> = {
  new_enquiry: 0,
  info_sent: 1,
  nurturing: 2,
  form_started: 3,
  enrolled: 4,
  first_session: 5,
  day3: 6,
  week2: 7,
  month1: 8,
  retained: 9,
};

export interface JourneyInput {
  email: string | null | undefined;
  serviceId: string | null | undefined;
  stage: PortalStage;
  parentName?: string | null;
  childName?: string | null;
  /** Anchors the first-session sequence, including its -24h reminder. */
  firstSessionDate?: Date | null;
}

/**
 * Move a portal family to `stage` and schedule whatever that stage sends.
 *
 * Idempotent: re-running with the same stage does nothing, so it's safe
 * to call from a route that fires on every autosave.
 */
export async function syncParentJourney(input: JourneyInput): Promise<void> {
  try {
    const email = input.email?.trim().toLowerCase();
    if (!email || !input.serviceId) {
      // Not an error: before a family picks a school there is no centre
      // to send centre-specific mail from.
      return;
    }

    const existing = await prisma.parentEnquiry.findFirst({
      where: { parentEmail: email, serviceId: input.serviceId, deleted: false },
      select: { id: true, stage: true, firstSessionDate: true },
      orderBy: { createdAt: "desc" },
    });

    const enquiryId = existing
      ? existing.id
      : (
          await prisma.parentEnquiry.create({
            data: {
              serviceId: input.serviceId,
              parentEmail: email,
              parentName: input.parentName?.trim() || "Parent",
              childName: input.childName?.trim() || null,
              // Distinguishes portal families from the website form, so
              // the auto-response skip logic doesn't misfire on them.
              channel: "portal",
              stage: input.stage,
              stageChangedAt: new Date(),
              formStarted: RANK[input.stage] >= RANK.form_started,
              formCompleted: RANK[input.stage] >= RANK.enrolled,
              firstSessionDate: input.firstSessionDate ?? null,
            },
            select: { id: true },
          })
        ).id;

    if (!existing) {
      // Route callers all log their own creation event as
      // (id, null, stage) — a portal enquiry created directly at a stage
      // (e.g. `enrolled`) needs the same, or it never produces the
      // `toStage: "enrolled"` event the attribution query counts.
      await logEnquiryStageEvent(enquiryId, null, input.stage);
    }

    if (existing) {
      const current = RANK[existing.stage] ?? -1;
      const next = RANK[input.stage] ?? -1;
      if (next <= current && !firstSessionDateChanged(existing, input)) {
        // Already here or further along — re-scheduling would re-send.
        return;
      }
      await prisma.parentEnquiry.update({
        where: { id: enquiryId },
        data: {
          ...(next > current
            ? { stage: input.stage, stageChangedAt: new Date() }
            : {}),
          ...(input.firstSessionDate !== undefined
            ? { firstSessionDate: input.firstSessionDate }
            : {}),
          formStarted: true,
          ...(RANK[input.stage] >= RANK.enrolled ? { formCompleted: true } : {}),
          ...(input.childName ? { childName: input.childName } : {}),
        },
      });
      if (next > current) {
        await logEnquiryStageEvent(enquiryId, existing.stage, input.stage);
      }
      if (next <= current) return;
    }

    await scheduleNurtureFromStageChange(enquiryId, input.stage);

    logger.info("Portal family entered the nurture flow", {
      enquiryId,
      stage: input.stage,
      serviceId: input.serviceId,
      isNew: !existing,
    });
  } catch (err) {
    // Deliberately swallowed. A family must be able to submit their
    // enrolment when the marketing side is broken.
    logger.error("Parent journey sync failed", {
      stage: input.stage,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function firstSessionDateChanged(
  existing: { firstSessionDate: Date | null },
  input: JourneyInput,
): boolean {
  if (input.firstSessionDate === undefined) return false;
  const a = existing.firstSessionDate?.getTime() ?? null;
  const b = input.firstSessionDate?.getTime() ?? null;
  return a !== b;
}

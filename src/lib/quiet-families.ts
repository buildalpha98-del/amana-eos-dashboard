/**
 * Quiet families (Daniel, 21 Oct 2026): families we've checked in with
 * because they stopped coming ("we've missed you" for regular days, "we're
 * still here" for casual) — with the reason they gave, so staff can find
 * out why and call. Shown in Enrolments → Follow-ups until someone ticks
 * "We called them".
 */
import { prisma } from "@/lib/prisma";
import { MISSED_REASONS, type MissedReason } from "@/lib/missed-sessions";

const DAY = 24 * 3_600_000;
const SHOW_DAYS = 45;

export interface QuietFamily {
  childId: string;
  enrolmentId: string | null;
  childName: string;
  parentName: string;
  phone: string | null;
  serviceName: string | null;
  lastSeen: string | null;
  checkedInAt: string;
  reason: string | null;
  /** Needs a call: no answer yet, or an answer that asks for one. */
  callNeeded: boolean;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const QUIET_OK: MissedReason[] = ["all_good", "unwell"];

export async function quietFamilies(
  serviceIds: string[] | null,
  serviceName: Map<string, string>,
  now = new Date(),
): Promise<QuietFamily[]> {
  const kids = await prisma.child.findMany({
    where: {
      enrolmentId: { not: null },
      missedCheckInSentAt: { gte: new Date(now.getTime() - SHOW_DAYS * DAY) },
      ...(serviceIds === null ? {} : { serviceId: { in: serviceIds } }),
    },
    select: {
      id: true,
      firstName: true,
      serviceId: true,
      enrolmentId: true,
      lastAttendedAt: true,
      missedCheckInSentAt: true,
      missedCheckInReason: true,
      quietFollowUpAt: true,
      enrolment: { select: { primaryParent: true } },
    },
    orderBy: { missedCheckInSentAt: "asc" },
    take: 200,
  });
  return kids
    .filter((k) => !k.quietFollowUpAt || (k.missedCheckInSentAt && k.quietFollowUpAt < k.missedCheckInSentAt))
    .map((k) => {
      const p = (k.enrolment?.primaryParent ?? {}) as Record<string, unknown>;
      const reason = (k.missedCheckInReason as MissedReason | null) ?? null;
      return {
        childId: k.id,
        enrolmentId: k.enrolmentId,
        childName: k.firstName,
        parentName: [text(p.firstName), text(p.surname)].filter(Boolean).join(" ") || "Parent",
        phone: text(p.mobile) || null,
        serviceName: k.serviceId ? serviceName.get(k.serviceId) ?? null : null,
        lastSeen: k.lastAttendedAt?.toISOString().slice(0, 10) ?? null,
        checkedInAt: k.missedCheckInSentAt!.toISOString(),
        reason: reason ? MISSED_REASONS[reason] ?? reason : null,
        callNeeded: !reason || !QUIET_OK.includes(reason),
      };
    });
}

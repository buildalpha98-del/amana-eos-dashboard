/**
 * The parent funnel (Daniel, 16 Oct 2026) — where every family is right now,
 * per centre, for the Parent Journey page. A snapshot of families who
 * enquired or enrolled in the last `days` days:
 *
 *   enquired     enquiry, hasn't started the form
 *   formStarted  started the enrolment form, not submitted
 *   waiting      submitted, waiting on us (overdue = past the 24-hour promise)
 *   ownaSetup    approved, OWNA handover not finished
 *   ready        approved + OWNA done, child hasn't attended yet
 *   attending    a child has attended
 *   lost         enquiry went cold, withdrew, or declined
 * `attendanceLive` is false where the centre's OWNA sign-ins aren't syncing:
 * there, "ready" includes families who may well be attending.
 */
import { prisma } from "@/lib/prisma";
import { readHandoff } from "@/lib/owna-handoff";

const DAY = 24 * 3_600_000;

export interface FunnelRow {
  serviceId: string;
  serviceName: string;
  enquired: number;
  formStarted: number;
  waiting: number;
  overdue: number;
  ownaSetup: number;
  ready: number;
  attending: number;
  attendanceLive: boolean;
  lost: number;
}

const PRE_FORM = ["new_enquiry", "info_sent", "nurturing"];
const LOST = ["cold", "withdrawn", "declined", "lost"];

export async function getParentFunnel(serviceIds: string[] | null, days = 90, now = new Date()): Promise<FunnelRow[]> {
  const since = new Date(now.getTime() - days * DAY);
  const services = await prisma.service.findMany({
    where: { status: "active", ...(serviceIds ? { id: { in: serviceIds } } : {}) },
    select: { id: true, name: true, ownaServiceId: true, ownaSyncedAt: true },
    orderBy: { name: "asc" },
  });
  const ids = services.map((s) => s.id);

  const [enquiries, subs] = await Promise.all([
    prisma.parentEnquiry.groupBy({
      by: ["serviceId", "stage"],
      where: { deleted: false, serviceId: { in: ids }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.enrolmentSubmission.findMany({
      where: { serviceId: { in: ids }, createdAt: { gte: since }, status: { notIn: ["archived", "rejected"] } },
      select: {
        serviceId: true,
        status: true,
        createdAt: true,
        ownaHandoff: { select: { state: true } },
        childRecords: { select: { firstAttendedAt: true } },
      },
    }),
  ]);

  return services.map((s) => {
    const live = !!s.ownaServiceId && !!s.ownaSyncedAt && now.getTime() - s.ownaSyncedAt.getTime() < 2 * DAY;
    const eq = enquiries.filter((e) => e.serviceId === s.id);
    const count = (stages: string[]) => eq.filter((e) => stages.includes(e.stage)).reduce((n, e) => n + e._count._all, 0);
    const mine = subs.filter((x) => x.serviceId === s.id);
    const waitingSubs = mine.filter((x) => x.status !== "processed");
    const approved = mine.filter((x) => x.status === "processed");
    const attended = approved.filter((x) => x.childRecords.some((c) => c.firstAttendedAt));
    const handoverDone = (x: (typeof approved)[number]) => {
      const st = readHandoff(x.ownaHandoff?.state);
      return !!st && Object.keys(st.steps).length === 4;
    };
    const notAttended = approved.filter((x) => !x.childRecords.some((c) => c.firstAttendedAt));
    return {
      serviceId: s.id,
      serviceName: s.name.replace(/^Amana OSHC\s+/i, ""),
      enquired: count(PRE_FORM),
      formStarted: count(["form_started"]),
      waiting: waitingSubs.length,
      overdue: waitingSubs.filter((x) => x.status === "submitted" && now.getTime() - x.createdAt.getTime() > DAY).length,
      ownaSetup: notAttended.filter((x) => !handoverDone(x)).length,
      ready: notAttended.filter(handoverDone).length,
      attending: attended.length,
      attendanceLive: live,
      lost: count(LOST),
    };
  });
}

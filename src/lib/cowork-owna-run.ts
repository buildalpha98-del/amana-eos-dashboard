/**
 * Cowork OWNA data run (Daniel, 21 Oct 2026).
 *
 * Amana has no OWNA API key (it costs too much), so Cowork reads each
 * centre's OWNA pages — midweek and at the end of the week — and POSTs what
 * it saw to /api/cowork/owna/run. This module turns that report into the
 * same shapes the OWNA API returns and runs the EXISTING sync
 * (syncOwnaService) over it, so everything downstream works unchanged:
 *
 *   - children + their regular booked days (OWNA mirror Child rows);
 *   - DailyAttendance totals per day per session;
 *   - per-child first / last attendance on the enrolment child
 *     (recordOwnaAttendance) → first-day emails release themselves, the
 *     first-day check needs no button, "we've missed you" can run;
 *   - Service.coworkFeedAt, which makes the centre's attendance count as
 *     live for the parent emails (attendanceDataLive).
 *
 * Children without an OWNA id get a stable synthetic one from their name +
 * date of birth, so the same child is the same row run to run.
 */
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { syncOwnaService } from "@/lib/owna-sync";
import { resolveRoomIds, requireFromMap } from "@/lib/room-resolver";
import type { OwnaAttendanceRecord, OwnaChild, OwnaClient } from "@/lib/owna";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const days = z
  .object({
    monday: z.boolean().optional(),
    tuesday: z.boolean().optional(),
    wednesday: z.boolean().optional(),
    thursday: z.boolean().optional(),
    friday: z.boolean().optional(),
  })
  .partial();

const childSchema = z.object({
  /** OWNA's child id when Cowork can see it (e.g. in the page URL). */
  ownaChildId: z.string().trim().min(1).optional(),
  firstName: z.string().trim().min(1),
  surname: z.string().trim().min(1),
  dob: isoDate.optional(),
  room: z.string().trim().optional(),
  /** Still enrolled in OWNA? */
  active: z.boolean().default(true),
  /** Regular (permanent) booked days. Casual-only families: leave empty. */
  bookedDays: days.default({}),
});

const sessionSchema = z.enum(["bsc", "asc", "vc"]);
const attendanceSchema = z.object({
  ownaChildId: z.string().trim().min(1).optional(),
  firstName: z.string().trim().min(1),
  surname: z.string().trim().min(1),
  dob: isoDate.optional(),
  date: isoDate,
  session: sessionSchema,
  /** Signed in (came) — false for a booked child who was absent. */
  signedIn: z.boolean(),
  signInTime: z.string().trim().optional(),
  signOutTime: z.string().trim().optional(),
  /** Casual (one-off) booking for this day rather than a regular day. */
  casual: z.boolean().optional(),
});

export const coworkOwnaRunSchema = z.object({
  serviceCode: z.string().trim().min(1),
  runType: z.enum(["midweek", "end_of_week", "ad_hoc"]).default("ad_hoc"),
  periodStart: isoDate.optional(),
  periodEnd: isoDate.optional(),
  children: z.array(childSchema).max(2000).default([]),
  attendance: z.array(attendanceSchema).max(20000).default([]),
});
export type CoworkOwnaRun = z.infer<typeof coworkOwnaRunSchema>;

const norm = (s: string) => s.normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

/** OWNA's id, or a stable one from name + date of birth. */
export function coworkChildId(serviceCode: string, c: { ownaChildId?: string; firstName: string; surname: string; dob?: string }) {
  return c.ownaChildId ?? `cowork:${serviceCode.toLowerCase()}:${norm(c.surname)}:${norm(c.firstName)}:${c.dob ?? "nodob"}`;
}

/** Session → the time range sessionTypeFromTime() reads back. */
const SESSION_TIME: Record<z.infer<typeof sessionSchema>, string> = {
  bsc: "07:00-09:00",
  asc: "15:00-18:00",
  vc: "09:00-15:00",
};

function toOwnaChild(code: string, c: CoworkOwnaRun["children"][number]): OwnaChild {
  const d = c.bookedDays ?? {};
  return {
    id: coworkChildId(code, c),
    centreId: code,
    centre: code,
    room: c.room ?? "",
    roomId: "",
    firstname: c.firstName,
    middlename: "",
    surname: c.surname,
    dob: c.dob ?? null,
    dobday: 0,
    dobmonth: 0,
    gender: "",
    crn: null,
    attending: c.active,
    activeFrom: null,
    finishDate: null,
    parentIds: [],
    monday: !!d.monday,
    tuesday: !!d.tuesday,
    wednesday: !!d.wednesday,
    thursday: !!d.thursday,
    friday: !!d.friday,
    saturday: false,
    sunday: false,
    mondayAlt: false,
    tuesdayAlt: false,
    wednesdayAlt: false,
    thursdayAlt: false,
    fridayAlt: false,
    saturdayAlt: false,
    sundayAlt: false,
    indigenous: false,
    indigenousStatus: null,
    streetAddress: null,
    suburb: null,
    state: null,
    postcode: null,
    mainLanguageAtHome: null,
    countryOfBirth: null,
    disabilities: null,
    lastUpdated: "",
  } as unknown as OwnaChild;
}

function toOwnaAttendance(code: string, a: CoworkOwnaRun["attendance"][number], i: number): OwnaAttendanceRecord {
  return {
    id: `cowork:${code}:${a.date}:${a.session}:${i}`,
    centreId: code,
    centre: code,
    room: "",
    roomId: "",
    child: `${a.firstName} ${a.surname}`,
    childId: coworkChildId(code, a),
    attending: a.signedIn,
    signIn: a.signedIn ? a.signInTime || "signed in" : "",
    signOut: a.signOutTime || "",
    signInParent: "",
    signInParentId: "",
    signOutParent: "",
    signOutParentId: "",
    comments: a.casual ? "casual" : "",
    attendanceDate: a.date,
    sessionOfCare: SESSION_TIME[a.session],
    fee: 0,
    audit: "",
    dateAdded: "",
  };
}

export interface CoworkRunResult {
  runId: string;
  children: number;
  attendance: number;
  signedIn: number;
  matched: number;
  errors: string[];
}

export async function runCoworkOwnaData(run: CoworkOwnaRun, now = new Date()): Promise<CoworkRunResult | null> {
  const service = await prisma.service.findUnique({ where: { code: run.serviceCode }, select: { id: true, code: true } });
  if (!service) return null;
  const code = service.code;

  // Every child seen in attendance must exist as a mirror row too, or the
  // per-child matching has nothing to match against.
  const known = new Map(run.children.map((c) => [coworkChildId(code, c), c]));
  for (const a of run.attendance) {
    const id = coworkChildId(code, a);
    if (!known.has(id)) known.set(id, { ownaChildId: a.ownaChildId, firstName: a.firstName, surname: a.surname, dob: a.dob, active: true, bookedDays: {} });
  }
  const children = [...known.values()].map((c) => toOwnaChild(code, c));
  const attendance = run.attendance.map((a, i) => toOwnaAttendance(code, a, i));

  // The same client surface syncOwnaService calls, answered from the report.
  const adapter = {
    getChildren: async () => children,
    getAttendance: async () => attendance,
    getEnquiries: async () => [],
    getIncidents: async () => [],
  } as unknown as OwnaClient;

  const errors: string[] = [];
  try {
    const r = await syncOwnaService(code, service.id, code, adapter);
    if (r.error) errors.push(r.error);
  } catch (err) {
    logger.error("Cowork OWNA run failed", { serviceCode: code, err });
    errors.push(err instanceof Error ? err.message : String(err));
  }

  // DailyAttendance in the dashboard's convention (budget, spending,
  // imports): enrolled = PERMANENT bookings, attended = CASUAL bookings,
  // absent = booked but didn't come. The generic sync writes total/signed-in
  // instead, so restate each day+session Cowork reported.
  try {
    const groups = new Map<string, { date: string; session: "bsc" | "asc" | "vc"; permanent: number; casual: number; absent: number }>();
    for (const a of run.attendance) {
      const k = `${a.date}_${a.session}`;
      const g = groups.get(k) ?? { date: a.date, session: a.session, permanent: 0, casual: 0, absent: 0 };
      if (a.casual) g.casual++;
      else g.permanent++;
      if (!a.signedIn) g.absent++;
      groups.set(k, g);
    }
    const rooms = await resolveRoomIds(service.id, [...new Set([...groups.values()].map((g) => g.session))]);
    for (const g of groups.values()) {
      const date = new Date(`${g.date}T00:00:00Z`);
      await prisma.dailyAttendance.upsert({
        where: { serviceId_date_sessionType: { serviceId: service.id, date, sessionType: g.session } },
        update: { enrolled: g.permanent, attended: g.casual, absent: g.absent },
        create: {
          serviceId: service.id,
          date,
          sessionType: g.session,
          roomId: requireFromMap(rooms, g.session),
          enrolled: g.permanent,
          attended: g.casual,
          absent: g.absent,
        },
      });
    }
  } catch (err) {
    logger.error("Cowork OWNA run: daily totals failed", { serviceCode: code, err });
    errors.push(`daily totals: ${err instanceof Error ? err.message : String(err)}`);
  }

  const matched = await prisma.child.count({
    where: { serviceId: service.id, enrolmentId: { not: null }, ownaMatchChildId: { in: children.map((c) => c.id) } },
  });
  await prisma.service.update({ where: { id: service.id }, data: { coworkFeedAt: now } });
  const log = await prisma.ownaDataRun.create({
    data: {
      serviceId: service.id,
      source: "cowork",
      runType: run.runType,
      periodStart: run.periodStart ? new Date(`${run.periodStart}T00:00:00Z`) : null,
      periodEnd: run.periodEnd ? new Date(`${run.periodEnd}T00:00:00Z`) : null,
      children: children.length,
      attendance: attendance.length,
      signedIn: attendance.filter((a) => a.attending).length,
      matched,
      errors: errors.length ? (errors as Prisma.InputJsonValue) : undefined,
    },
  });
  return {
    runId: log.id,
    children: children.length,
    attendance: attendance.length,
    signedIn: log.signedIn,
    matched,
    errors,
  };
}

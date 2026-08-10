/**
 * GET/PATCH /api/lms/assignments
 *
 * "What training is assigned to this person?" — the question the admin
 * surfaces could not previously answer.
 *
 * There were three admin views and none of them answered it. The
 * Compliance tab answers "who is BEHIND on required training", the LMS
 * Courses tab is course-first ("who is on this course"), and the
 * Induction tab is a pipeline board. Nothing was person-first.
 *
 * Worse, the two sides disagreed. `/api/lms/my-enrollments` shows a
 * learner every enrolment they hold, with no filter at all, while the
 * compliance report only counts courses that are `published` AND on a
 * required track. So an educator could open My Training, see eight
 * essential courses waiting, and an owner looking at the admin side
 * would see nothing assigned to them — because the seeded induction
 * courses ship as DRAFTS (see prisma/seed-induction.ts).
 *
 * This endpoint deliberately returns EVERY enrolment, draft courses
 * included, and marks which ones the compliance report counts. An
 * assignment that exists is an assignment, whether or not its course has
 * been published — and the reason a course is invisible in Compliance
 * should be visible rather than mysterious.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

/** Tracks the compliance report treats as required. */
const REQUIRED_TRACKS = ["essential", "monthly"];

const patchSchema = z.object({
  enrollmentId: z.string().min(1),
  /** ISO date, or null to clear the due date entirely. */
  dueDate: z.string().nullable(),
});

/**
 * Both filters are enums in the schema, so an unrecognised value is
 * rejected rather than cast through. A silently-ignored filter is worse
 * than an error here: the admin would read the unfiltered list as though
 * it were filtered and conclude the wrong thing about who has what.
 */
const TRACKS = ["essential", "monthly", "library"] as const;
const ROLES = [
  "owner",
  "head_office",
  "admin",
  "member",
  "staff",
  "marketing",
] as const;

type Track = (typeof TRACKS)[number];
type UserRole = (typeof ROLES)[number];

export const GET = withApiAuth(
  async (req) => {
    const params = new URL(req.url).searchParams;
    const userId = params.get("userId");
    const trackParam = params.get("track");
    const roleParam = params.get("role");

    if (trackParam && !(TRACKS as readonly string[]).includes(trackParam)) {
      throw ApiError.badRequest(`Unknown training type "${trackParam}"`);
    }
    if (roleParam && !(ROLES as readonly string[]).includes(roleParam)) {
      throw ApiError.badRequest(`Unknown role "${roleParam}"`);
    }
    const track = trackParam as Track | null;
    const role = roleParam as UserRole | null;

    const enrollments = await prisma.lMSEnrollment.findMany({
      where: {
        ...(userId ? { userId } : {}),
        user: { active: true, ...(role ? { role } : {}) },
        course: {
          // A deleted course is genuinely gone; its enrolments are
          // noise. Draft courses, by contrast, are kept — being unable
          // to see them is the whole problem this endpoint solves.
          deleted: false,
          ...(track ? { track } : {}),
        },
      },
      select: {
        id: true,
        status: true,
        dueDate: true,
        enrolledAt: true,
        completedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            // Which centre the STAFF MEMBER is attached to — the filter
            // asks "show me Auburn's people", not "show me Auburn's
            // courses". A course has its own service and they are not
            // the same question.
            service: { select: { id: true, name: true } },
          },
        },
        course: {
          select: {
            id: true,
            title: true,
            track: true,
            status: true,
            isRequired: true,
            _count: { select: { modules: true } },
          },
        },
        _count: { select: { moduleProgress: { where: { completed: true } } } },
      },
      orderBy: [{ user: { name: "asc" } }, { enrolledAt: "asc" }],
      take: 2000,
    });

    const rows = enrollments.map((e) => {
      const total = e.course._count.modules;
      const done = e._count.moduleProgress;
      return {
        enrollmentId: e.id,
        status: e.status,
        dueDate: e.dueDate,
        enrolledAt: e.enrolledAt,
        completedAt: e.completedAt,
        user: e.user,
        course: {
          id: e.course.id,
          title: e.course.title,
          track: e.course.track,
          status: e.course.status,
        },
        progressPct: total > 0 ? Math.round((done / total) * 100) : 0,
        /**
         * Whether the weekly compliance report and the admin summary
         * email count this one. False for a draft course, which is
         * exactly the case that made an assignment look absent.
         */
        countedInCompliance:
          e.course.status === "published" &&
          (REQUIRED_TRACKS.includes(e.course.track) || e.course.isRequired),
      };
    });

    return NextResponse.json({ assignments: rows });
  },
  { roles: ["owner", "head_office", "admin"] },
);

/**
 * Change an assignment's due date.
 *
 * The only field worth editing. Status is derived from module progress
 * by `recalcEnrollmentStatus` and must never be set by hand — writing it
 * here would put an enrolment's status out of step with the progress
 * rows it is computed from.
 */
export const PATCH = withApiAuth(
  async (req) => {
    const parsed = patchSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid change", parsed.error.flatten());
    }
    const { enrollmentId, dueDate } = parsed.data;

    const existing = await prisma.lMSEnrollment.findUnique({
      where: { id: enrollmentId },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound("Assignment not found");

    let due: Date | null = null;
    if (dueDate) {
      due = new Date(dueDate);
      if (Number.isNaN(due.getTime())) {
        throw ApiError.badRequest("That due date isn't a real date");
      }
    }

    const updated = await prisma.lMSEnrollment.update({
      where: { id: enrollmentId },
      data: { dueDate: due },
      select: { id: true, dueDate: true },
    });

    return NextResponse.json({ assignment: updated });
  },
  { roles: ["owner", "head_office", "admin"] },
);

/**
 * GET /api/lms/training-records
 *
 * "Which staff have completed what, and when?" — the question none of
 * the existing surfaces could answer.
 *
 * The compliance report is structurally incapable of it: it queries
 * `status: { not: "completed" }`, because it was built to answer "who is
 * BEHIND". The Assignments tab can be switched to completed but carries
 * the ASSIGNED date, not the completion date, and no score. The only
 * real completion evidence — the certificate and transcript PDFs — is
 * reachable one person at a time by drilling into a specific course.
 *
 * So this is the register: completed enrolments, newest first, with the
 * completion date and score, filterable the way an assessor or a state
 * manager actually asks — by centre, by course, by track, by period.
 *
 * Two decisions worth stating:
 *
 * - **Completion is `completedAt`, not `status`.** A row can carry
 *   `status: "completed"` with a null timestamp if it was completed
 *   before the column existed or written by hand. Those rows are still
 *   returned (they ARE completions) but sort last and are reported as
 *   having no date rather than being given a fabricated one.
 *
 * - **`completedLate` is computed, not stored.** Finishing after the due
 *   date is the thing a regulator asks about, and it can only be known
 *   by comparing two nullable dates. Absent either one, it is null —
 *   "unknown", not "on time".
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

const TRACKS = ["essential", "monthly", "library"] as const;
type Track = (typeof TRACKS)[number];

/**
 * A ceiling, not a page size. The register is meant to be filtered and
 * exported rather than paged, and an org this size will not approach it
 * — but an unbounded query on a growing table is a slow outage waiting
 * to happen.
 */
const MAX_ROWS = 5000;

/** Parse a YYYY-MM-DD (or ISO) bound, rejecting nonsense rather than ignoring it. */
function parseDate(raw: string | null, label: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw ApiError.badRequest(`${label} isn't a real date`);
  }
  return d;
}

export const GET = withApiAuth(
  async (req) => {
    const params = new URL(req.url).searchParams;

    const trackParam = params.get("track");
    if (trackParam && !(TRACKS as readonly string[]).includes(trackParam)) {
      throw ApiError.badRequest(`Unknown training type "${trackParam}"`);
    }
    const track = trackParam as Track | null;

    const serviceId = params.get("serviceId");
    const courseId = params.get("courseId");
    const userId = params.get("userId");

    const from = parseDate(params.get("from"), "The start date");
    /**
     * `to` is inclusive of the whole day. A bare YYYY-MM-DD parses to
     * midnight, so an exclusive comparison would silently drop
     * everything completed on the last day of the range someone asked
     * for.
     */
    const toRaw = parseDate(params.get("to"), "The end date");
    const to = toRaw
      ? new Date(toRaw.getTime() + 24 * 60 * 60 * 1000 - 1)
      : null;

    if (from && to && from > to) {
      throw ApiError.badRequest("The start date is after the end date");
    }

    const enrollments = await prisma.lMSEnrollment.findMany({
      where: {
        status: "completed",
        ...(userId ? { userId } : {}),
        ...(courseId ? { courseId } : {}),
        /**
         * The date filter only applies to rows that HAVE a date. Adding
         * a range must not silently drop undated completions from the
         * count without saying so — but neither can it claim they fall
         * inside a period nobody can evidence, so a range excludes them.
         */
        ...(from || to
          ? { completedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
        user: {
          active: true,
          // The centre the STAFF MEMBER is attached to, not the course's.
          ...(serviceId ? { serviceId } : {}),
        },
        course: { deleted: false, ...(track ? { track } : {}) },
      },
      select: {
        id: true,
        completedAt: true,
        enrolledAt: true,
        dueDate: true,
        score: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            service: { select: { id: true, name: true } },
          },
        },
        course: { select: { id: true, title: true, track: true } },
      },
      // Undated completions sort last rather than jumping to the top,
      // which is where nulls land on a descending sort by default.
      orderBy: [{ completedAt: "desc" }, { enrolledAt: "desc" }],
      take: MAX_ROWS,
    });

    const rows = enrollments.map((e) => ({
      enrollmentId: e.id,
      completedAt: e.completedAt,
      dueDate: e.dueDate,
      score: e.score,
      /**
       * Null means "can't tell" — no due date was set, or no completion
       * date was recorded. Reporting that as on-time would be inventing
       * evidence.
       */
      completedLate:
        e.completedAt && e.dueDate ? e.completedAt > e.dueDate : null,
      user: e.user,
      course: e.course,
    }));

    const scored = rows.filter((r) => typeof r.score === "number");

    return NextResponse.json({
      records: rows,
      summary: {
        completions: rows.length,
        /** Distinct people, not rows — one person can complete many courses. */
        staff: new Set(rows.map((r) => r.user.id)).size,
        courses: new Set(rows.map((r) => r.course.id)).size,
        late: rows.filter((r) => r.completedLate === true).length,
        undated: rows.filter((r) => !r.completedAt).length,
        /** Averaged over scored rows only — a course with no quiz has no score. */
        averageScore: scored.length
          ? Math.round(
              scored.reduce((a, r) => a + (r.score ?? 0), 0) / scored.length,
            )
          : null,
        /** True when the ceiling was hit and the view is showing a slice. */
        truncated: rows.length === MAX_ROWS,
      },
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);

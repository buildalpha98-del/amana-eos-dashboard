import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { isAdminRole } from "@/lib/role-permissions";
import { ApiError } from "@/lib/api-error";

/**
 * GET /api/lms/transcript?userId=<id>
 *
 * A staff member's full training record for the transcript PDF. Any user can
 * fetch their OWN transcript; fetching someone else's requires an admin role.
 * Returns rows for every enrolment (all tracks, all statuses).
 */
export const GET = withApiAuth(async (req, session) => {
  const url = new URL(req.url);
  const requestedUserId = url.searchParams.get("userId");
  const targetId = requestedUserId ?? session.user.id;

  if (targetId !== session.user.id && !isAdminRole(session.user.role)) {
    throw ApiError.forbidden("You can only view your own training transcript.");
  }

  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, email: true },
  });
  if (!user) throw ApiError.notFound("User not found");

  // Select only what the transcript PDF renders: title/track/status/
  // completion/score (see TranscriptRow in @/lib/transcript-pdf).
  const enrollments = await prisma.lMSEnrollment.findMany({
    where: { userId: targetId, course: { deleted: false } },
    orderBy: [{ completedAt: "desc" }, { enrolledAt: "desc" }],
    select: {
      status: true,
      completedAt: true,
      score: true,
      course: { select: { title: true, track: true } },
    },
  });

  const rows = enrollments.map((e) => ({
    courseTitle: e.course.title,
    track: e.course.track,
    status: e.status,
    completedAt: e.completedAt ? e.completedAt.toISOString() : null,
    score: e.score,
  }));

  return NextResponse.json({
    learnerName: user.name,
    learnerEmail: user.email,
    generatedAt: new Date().toISOString(),
    rows,
  });
});

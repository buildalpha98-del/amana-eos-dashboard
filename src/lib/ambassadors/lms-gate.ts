import { prisma } from "@/lib/prisma";

/**
 * The hard gate: no incentive is payable unless the credited educator has
 * completed the Amana Ambassadors LMS course (all 3 units — completion is
 * derived by recalcEnrollmentStatus, so LMSEnrollment.status === completed
 * IS "all units done").
 *
 * Fails closed: if the course can't be found (deleted/unseeded), nobody
 * passes the gate.
 */

const COURSE_TITLE = "Amana Ambassadors";
const CACHE_TTL_MS = 60_000;

let courseCache: { id: string | null; at: number } | null = null;

export function _clearAmbassadorCourseCache(): void {
  courseCache = null;
}

async function ambassadorsCourseId(): Promise<string | null> {
  if (courseCache && Date.now() - courseCache.at < CACHE_TTL_MS) {
    return courseCache.id;
  }
  const course = await prisma.lMSCourse.findFirst({
    where: { title: COURSE_TITLE, track: "library", deleted: false },
    select: { id: true },
  });
  courseCache = { id: course?.id ?? null, at: Date.now() };
  return courseCache.id;
}

export async function hasCompletedAmbassadorsCourse(
  userId: string,
): Promise<boolean> {
  const courseId = await ambassadorsCourseId();
  if (!courseId) return false;
  const enrollment = await prisma.lMSEnrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { status: true },
  });
  return enrollment?.status === "completed";
}

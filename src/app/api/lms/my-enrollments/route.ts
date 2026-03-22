import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
// GET /api/lms/my-enrollments — get current user's enrollments with course + module data
export const GET = withApiAuth(async (req, session) => {
const enrollments = await prisma.lMSEnrollment.findMany({
    where: { userId: session!.user.id },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
      course: {
        include: {
          modules: { orderBy: { sortOrder: "asc" } },
          service: { select: { id: true, name: true, code: true } },
          _count: { select: { modules: true, enrollments: true } },
        },
      },
      moduleProgress: {
        include: {
          module: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: { enrolledAt: "desc" },
  });

  return NextResponse.json(enrollments);
});

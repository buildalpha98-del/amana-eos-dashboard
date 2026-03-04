import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/lms/my-enrollments — get current user's enrollments with course + module data
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

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
}

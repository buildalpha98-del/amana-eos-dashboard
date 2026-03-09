import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateCourseSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  isRequired: z.boolean().optional(),
  serviceId: z.string().optional().nullable(),
  sortOrder: z.number().optional(),
});

// GET /api/lms/courses/[id] — get course with modules & enrollments
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const course = await prisma.lMSCourse.findUnique({
    where: { id },
    include: {
      service: { select: { id: true, name: true, code: true } },
      modules: { orderBy: { sortOrder: "asc" } },
      enrollments: {
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
          moduleProgress: {
            include: {
              module: { select: { id: true, title: true } },
            },
          },
        },
        orderBy: { enrolledAt: "desc" },
      },
    },
  });

  if (!course || course.deleted) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  // Staff can only view their own enrollment
  if (session!.user.role === "staff") {
    course.enrollments = course.enrollments.filter(
      (e) => e.userId === session!.user.id
    );
  }

  return NextResponse.json(course);
}

// PATCH /api/lms/courses/[id] — update course
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateCourseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const course = await prisma.lMSCourse.update({
    where: { id },
    data: parsed.data,
    include: {
      service: { select: { id: true, name: true, code: true } },
      modules: { orderBy: { sortOrder: "asc" } },
      _count: { select: { modules: true, enrollments: true } },
    },
  });

  return NextResponse.json(course);
}

// DELETE /api/lms/courses/[id] — soft delete course
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;

  await prisma.lMSCourse.update({
    where: { id },
    data: { deleted: true },
  });

  return NextResponse.json({ success: true });
}

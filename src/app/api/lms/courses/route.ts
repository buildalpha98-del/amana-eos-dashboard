import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
const createCourseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  isRequired: z.boolean().optional(),
  serviceId: z.string().optional().nullable(),
  modules: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(["document", "video", "quiz", "checklist", "external_link"]).optional(),
        content: z.string().optional(),
        resourceUrl: z.string().optional(),
        documentId: z.string().optional(),
        duration: z.number().optional(),
        sortOrder: z.number().optional(),
        isRequired: z.boolean().optional(),
      })
    )
    .optional(),
});

// GET /api/lms/courses — list all courses
export const GET = withApiAuth(async (req, session) => {
const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const serviceId = searchParams.get("serviceId");

  const where: Record<string, unknown> = { deleted: false };
  if (status) where.status = status;

  // Staff see published courses for their service + company-wide
  if (session!.user.role === "staff") {
    where.status = "published";
    if (session!.user.serviceId) {
      where.OR = [
        { serviceId: session!.user.serviceId },
        { serviceId: null },
      ];
    }
  } else if (serviceId) {
    where.serviceId = serviceId;
  }

  const courses = await prisma.lMSCourse.findMany({
    where: where as any,
    include: {
      service: { select: { id: true, name: true, code: true } },
      _count: { select: { modules: true, enrollments: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(courses);
});

// POST /api/lms/courses — create a new course (owner/admin only)
export const POST = withApiAuth(async (req, session) => {
const body = await req.json();
  const parsed = createCourseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { modules, ...courseData } = parsed.data;

  const course = await prisma.lMSCourse.create({
    data: {
      ...courseData,
      modules: modules
        ? {
            create: modules.map((m, i) => ({
              ...m,
              sortOrder: m.sortOrder ?? i,
            })),
          }
        : undefined,
    },
    include: {
      service: { select: { id: true, name: true, code: true } },
      modules: { orderBy: { sortOrder: "asc" } },
      _count: { select: { modules: true, enrollments: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "LMSCourse",
      entityId: course.id,
      details: { title: course.title },
    },
  });

  return NextResponse.json(course, { status: 201 });
}, { roles: ["owner", "head_office", "admin"] });

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { recalcEnrollmentStatus } from "@/lib/lms-progress";
const enrollSchema = z.object({
  courseId: z.string().min(1),
  userIds: z.array(z.string().min(1)).min(1),
  dueDate: z.string().optional(),
});

const progressSchema = z.object({
  enrollmentId: z.string().min(1),
  moduleId: z.string().min(1),
  completed: z.boolean(),
});

const unenrollSchema = z.object({
  enrollmentId: z.string().min(1),
});

// POST /api/lms/enrollments — enrol staff OR update module progress
export const POST = withApiAuth(async (req, session) => {
const body = (await parseJsonBody(req)) as Record<string, unknown>;

  // ── Mode B: Progress update ──
  if (body.enrollmentId && body.moduleId !== undefined) {
    const parsed = progressSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Non-admins can only update their own progress (admins may override).
    const isAdmin = isAdminRole(session!.user.role);
    const enrollment = await prisma.lMSEnrollment.findUnique({
      where: { id: parsed.data.enrollmentId },
    });
    if (!enrollment) {
      return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
    }
    if (!isAdmin && enrollment.userId !== session!.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const progressModule = await prisma.lMSModule.findUnique({
      where: { id: parsed.data.moduleId },
      select: { id: true, type: true, courseId: true },
    });
    if (!progressModule || progressModule.courseId !== enrollment.courseId) {
      return NextResponse.json(
        { error: "Module not found in this course" },
        { status: 404 }
      );
    }
    // Quiz modules are completed by PASSING the quiz (server-side scored) —
    // never by a manual tick. Without this, the induction gate is bypassable.
    if (progressModule.type === "quiz" && parsed.data.completed && !isAdmin) {
      const passedAttempt = await prisma.lMSQuizAttempt.findFirst({
        where: { enrollmentId: enrollment.id, moduleId: progressModule.id, passed: true },
        select: { id: true },
      });
      if (!passedAttempt) {
        return NextResponse.json(
          { error: "Quiz modules are completed by passing the quiz in the course player." },
          { status: 403 }
        );
      }
    }

    const progress = await prisma.lMSModuleProgress.upsert({
      where: {
        enrollmentId_moduleId: {
          enrollmentId: parsed.data.enrollmentId,
          moduleId: parsed.data.moduleId,
        },
      },
      update: {
        completed: parsed.data.completed,
        completedAt: parsed.data.completed ? new Date() : null,
      },
      create: {
        enrollmentId: parsed.data.enrollmentId,
        moduleId: parsed.data.moduleId,
        completed: parsed.data.completed,
        completedAt: parsed.data.completed ? new Date() : null,
      },
    });

    await recalcEnrollmentStatus(parsed.data.enrollmentId);

    return NextResponse.json(progress);
  }

  // ── Mode C: Self-enrol (staff/member can enrol themselves) ──
  if (body.selfEnrol && body.courseId) {
    const courseId = body.courseId as string;
    const course = await prisma.lMSCourse.findUnique({
      where: { id: courseId },
      include: { modules: true },
    });

    if (!course || course.deleted || course.status !== "published") {
      return NextResponse.json({ error: "Course not found or not published" }, { status: 404 });
    }

    // Check not already enrolled
    const existing = await prisma.lMSEnrollment.findFirst({
      where: { courseId, userId: session!.user.id },
    });
    if (existing) {
      return NextResponse.json({ error: "You are already enrolled in this course" }, { status: 409 });
    }

    const enrollment = await prisma.lMSEnrollment.create({
      data: {
        userId: session!.user.id,
        courseId,
        moduleProgress: {
          create: course.modules.map((mod) => ({
            moduleId: mod.id,
            completed: false,
          })),
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        course: { select: { id: true, title: true } },
        moduleProgress: true,
      },
    });

    return NextResponse.json({ enrolled: 1, enrollments: [enrollment] }, { status: 201 });
  }

  // ── Mode A: Enrol staff (owner/admin only) ──
  if (session!.user.role !== "owner" && session!.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = enrollSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const course = await prisma.lMSCourse.findUnique({
    where: { id: parsed.data.courseId },
    include: { modules: true },
  });

  if (!course || course.deleted) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  // Check existing enrollments
  const existingEnrollments = await prisma.lMSEnrollment.findMany({
    where: {
      courseId: parsed.data.courseId,
      userId: { in: parsed.data.userIds },
    },
    select: { userId: true },
  });
  const alreadyEnrolledIds = new Set(existingEnrollments.map((e) => e.userId));
  const newUserIds = parsed.data.userIds.filter((id) => !alreadyEnrolledIds.has(id));

  if (newUserIds.length === 0) {
    return NextResponse.json(
      { error: "All selected users are already enrolled in this course" },
      { status: 409 }
    );
  }

  // Create enrollments with pre-populated module progress
  const enrollments = await Promise.all(
    newUserIds.map((userId) =>
      prisma.lMSEnrollment.create({
        data: {
          userId,
          courseId: parsed.data.courseId,
          dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
          moduleProgress: {
            create: course.modules.map((mod) => ({
              moduleId: mod.id,
              completed: false,
            })),
          },
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          course: { select: { id: true, title: true } },
          moduleProgress: true,
        },
      })
    )
  );

  // Log activity
  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "enrol_lms",
      entityType: "LMSEnrollment",
      entityId: enrollments[0]?.id ?? "",
      details: {
        courseName: course.title,
        enrolledCount: enrollments.length,
        skippedCount: alreadyEnrolledIds.size,
      },
    },
  });

  return NextResponse.json(
    {
      enrolled: enrollments.length,
      skipped: alreadyEnrolledIds.size,
      enrollments,
    },
    { status: 201 }
  );
});

// DELETE /api/lms/enrollments — unenrol a user (owner/admin only)
export const DELETE = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
  const parsed = unenrollSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const enrollment = await prisma.lMSEnrollment.findUnique({
    where: { id: parsed.data.enrollmentId },
    include: {
      user: { select: { name: true } },
      course: { select: { title: true } },
    },
  });

  if (!enrollment) {
    return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  }

  // Cascade delete handles moduleProgress
  await prisma.lMSEnrollment.delete({
    where: { id: parsed.data.enrollmentId },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "unenrol_lms",
      entityType: "LMSEnrollment",
      entityId: parsed.data.enrollmentId,
      details: {
        userName: enrollment.user.name,
        courseName: enrollment.course.title,
      },
    },
  });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin"] });

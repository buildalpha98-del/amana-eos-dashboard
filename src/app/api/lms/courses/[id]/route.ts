import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { publishCourses } from "@/lib/course-publish";
const updateCourseSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  isRequired: z.boolean().optional(),
  serviceId: z.string().optional().nullable(),
  sortOrder: z.number().optional(),
  /**
   * Publish despite blockers. Deliberately explicit and deliberately
   * separate from the fields above — the caller has to have seen the
   * blockers and decided anyway.
   */
  force: z.boolean().optional(),
});

// GET /api/lms/courses/[id] — get course with modules & enrollments
export const GET = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

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

  const isAdmin = isAdminRole(session!.user.role);

  // Non-admins only see published courses (drafts are admin work-in-progress).
  if (!course || course.deleted || (!isAdmin && course.status !== "published")) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  // Non-admins can only view their own enrollment (other learners' progress
  // and contact details are admin-only).
  if (!isAdmin) {
    course.enrollments = course.enrollments.filter(
      (e) => e.userId === session!.user.id
    );
  }

  return NextResponse.json(course);
});

// PATCH /api/lms/courses/[id] — update course
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = updateCourseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { force, ...fields } = parsed.data;

  /**
   * Publishing goes through the shared path, not straight to `update`.
   *
   * `{ status: "published" }` on an essential course arms the induction
   * gate — a course that can't be completed becomes a wall a learner
   * can never get past, and they can then never clock in. This button
   * used to write it unchecked while the bulk panel refused the same
   * change, so the safe path was the obscure one. See course-publish.ts.
   *
   * Only on the transition INTO published: re-saving an already-live
   * course while editing its title shouldn't re-run the gate work.
   */
  const current = await prisma.lMSCourse.findUnique({
    where: { id },
    select: { status: true, deleted: true },
  });
  if (!current || current.deleted) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const isPublishing =
    fields.status === "published" && current.status !== "published";

  if (isPublishing) {
    const outcome = await publishCourses({
      courseIds: [id],
      force,
      actorUserId: session!.user.id,
    });
    if (!outcome.ok) {
      /**
       * The message carries the first blocker, not just a refusal. This
       * surfaces in a toast with nowhere to drill into, so "not ready"
       * on its own would send someone hunting.
       */
      const first = outcome.blocked[0];
      const reason = first?.blockers[0];
      return NextResponse.json(
        {
          error: reason
            ? `Can't publish "${first.courseTitle}" — ${reason.moduleTitle ? `${reason.moduleTitle}: ` : ""}${reason.message}`
            : `"${first?.courseTitle ?? "This course"}" isn't ready to publish`,
          blocked: outcome.blocked,
        },
        { status: 409 },
      );
    }
  }

  const course = await prisma.lMSCourse.update({
    where: { id },
    // Status is already written by publishCourses when publishing; passing
    // it again is harmless and keeps the non-publish cases (draft,
    // archived) working through the one update.
    data: fields,
    include: {
      service: { select: { id: true, name: true, code: true } },
      modules: { orderBy: { sortOrder: "asc" } },
      _count: { select: { modules: true, enrollments: true } },
    },
  });

  return NextResponse.json(course);
}, { roles: ["owner", "head_office", "admin"] });

// DELETE /api/lms/courses/[id] — soft delete course
export const DELETE = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  await prisma.lMSCourse.update({
    where: { id },
    data: { deleted: true },
  });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin"] });

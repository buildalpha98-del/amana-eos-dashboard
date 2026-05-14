import { NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";

/**
 * Parent-facing All About Me API.
 *
 * Amana Way stage 5 (Reassurance). The form is rendered on the parent
 * portal at /parent/children/[id]/all-about-me and the staff dashboard
 * surfaces the saved answers on the child's roll-call card so educators
 * can greet the child by nickname, avoid known fears, etc.
 */

const updateSchema = z.object({
  nickname: z.string().max(60).optional().nullable(),
  favouriteFood: z.string().max(200).optional().nullable(),
  favouriteToys: z.string().max(200).optional().nullable(),
  favouriteSubjects: z.string().max(200).optional().nullable(),
  hobbies: z.string().max(300).optional().nullable(),
  fears: z.string().max(500).optional().nullable(),
  calmingTechniques: z.string().max(2000).optional().nullable(),
  additionalNotes: z.string().max(2000).optional().nullable(),
});

async function assertParentOwnsChild(
  childId: string,
  parentEnrolmentIds: string[],
): Promise<void> {
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { id: true, enrolmentId: true },
  });
  if (!child) throw ApiError.notFound("Child not found");
  if (!child.enrolmentId || !parentEnrolmentIds.includes(child.enrolmentId)) {
    throw ApiError.forbidden("You do not have access to this child");
  }
}

export const GET = withParentAuth(async (_req, ctx) => {
  const params = await ctx.params;
  const childId = params?.id;
  if (!childId) throw ApiError.badRequest("Child ID is required");

  await assertParentOwnsChild(childId, ctx.parent.enrolmentIds);

  const record = await prisma.allAboutMe.findUnique({
    where: { childId },
  });

  return NextResponse.json({ allAboutMe: record });
});

export const PATCH = withParentAuth(async (req, ctx) => {
  const params = await ctx.params;
  const childId = params?.id;
  if (!childId) throw ApiError.badRequest("Child ID is required");

  await assertParentOwnsChild(childId, ctx.parent.enrolmentIds);

  const parsed = updateSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  }

  // Upsert so the row appears on first save without an explicit create step.
  // `submittedAt` is treated as a soft milestone: first save sets it, later
  // edits leave it alone (staff see "submitted 5 Mar; last edited yesterday").
  const existing = await prisma.allAboutMe.findUnique({ where: { childId } });
  const record = await prisma.allAboutMe.upsert({
    where: { childId },
    create: {
      childId,
      ...parsed.data,
      submittedAt: new Date(),
    },
    update: {
      ...parsed.data,
      submittedAt: existing?.submittedAt ?? new Date(),
    },
  });

  return NextResponse.json({ allAboutMe: record });
});

/**
 * Authored notes on a candidate.
 *
 * 2026-09-15. `RecruitmentCandidate.notes` is one text box, so when several
 * State Managers record why someone was or wasn't a fit, you lose who said it
 * and when — and the last person to save wins. Each observation is now its own
 * row, attributed and timestamped. The legacy field is untouched and is
 * rendered above the thread as "earlier notes".
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const noteInclude = {
  author: { select: { id: true, name: true, avatar: true } },
} as const;

export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const notes = await prisma.candidateNote.findMany({
    where: { candidateId: id },
    include: noteInclude,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ notes });
}, { feature: "recruitment.view" });

const createNoteSchema = z.object({
  body: z.string().trim().min(1, "Note cannot be empty").max(5000),
});

export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const parsed = createNoteSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
  }

  // 404 rather than a foreign-key error for a candidate that isn't there.
  const candidate = await prisma.recruitmentCandidate.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!candidate) throw ApiError.notFound("Candidate not found");

  const note = await prisma.candidateNote.create({
    data: {
      candidateId: id,
      authorId: session!.user.id,
      body: parsed.data.body.trim(),
    },
    include: noteInclude,
  });

  return NextResponse.json(note, { status: 201 });
}, { feature: "recruitment.candidates.manage" });

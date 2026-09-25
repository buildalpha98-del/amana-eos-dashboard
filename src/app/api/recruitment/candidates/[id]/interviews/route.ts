/**
 * Interview records for a candidate.
 *
 * 2026-09-16. `RecruitmentCandidate.interviewNotes` is one text box: a second
 * interview overwrote the first, and nothing recorded when it happened or who
 * was in the room. Each interview is now its own row, so a candidate who was
 * seen twice over two years reads as exactly that.
 *
 * The legacy field is untouched and rendered above the list as "earlier
 * interview notes" — nothing is migrated or lost.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { INTERVIEW_MODES, INTERVIEW_OUTCOMES } from "@/lib/recruitment/pool";

const interviewInclude = {
  conductedBy: { select: { id: true, name: true, avatar: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const interviews = await prisma.candidateInterview.findMany({
    where: { candidateId: id },
    include: interviewInclude,
    orderBy: { heldAt: "desc" },
  });
  return NextResponse.json({ interviews });
}, { feature: "recruitment.view" });

const createSchema = z.object({
  heldAt: z.coerce.date(),
  mode: z.enum(INTERVIEW_MODES).nullable().optional(),
  conductedById: z.string().nullable().optional(),
  panel: z.string().max(300).nullable().optional(),
  notes: z.string().trim().min(1, "Interview notes are required").max(20000),
  outcome: z.enum(INTERVIEW_OUTCOMES).nullable().optional(),
});

export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const parsed = createSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
  }

  // 404 rather than a foreign-key error for a candidate that isn't there.
  const candidate = await prisma.recruitmentCandidate.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!candidate) throw ApiError.notFound("Candidate not found");

  const d = parsed.data;
  const interview = await prisma.candidateInterview.create({
    data: {
      candidateId: id,
      heldAt: d.heldAt,
      mode: d.mode ?? null,
      // Default to whoever is logging it — usually the person who ran it.
      conductedById: d.conductedById ?? session!.user.id,
      panel: d.panel?.trim() || null,
      notes: d.notes.trim(),
      outcome: d.outcome ?? null,
      createdById: session!.user.id,
    },
    include: interviewInclude,
  });

  // Logging an interview means it happened, so the contact clock restarts —
  // otherwise someone you sat down with last week reads as "never contacted".
  await prisma.recruitmentCandidate.update({
    where: { id },
    data: { lastContactedAt: new Date() },
  });

  return NextResponse.json(interview, { status: 201 });
}, { feature: "recruitment.candidates.manage" });

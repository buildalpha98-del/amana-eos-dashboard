import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { candidateInclude } from "../route";

import { parseJsonBody } from "@/lib/api-error";
import {
  POOL_STAGES,
  POOL_SOURCES,
  POOL_SESSIONS,
  POOL_DAYS,
  RIGHT_TO_WORK,
  NOT_HIRED_REASONS,
} from "@/lib/recruitment/pool";
/**
 * 2026-09-15: extended for the casual pool (see src/lib/recruitment/pool.ts).
 * `stage` and `source` were unvalidated free text — the convert route wrote
 * "hired", the schema comment listed a different set, and nothing checked
 * either. Both are now enums, so the funnel can't drift by typo.
 */
const updateCandidateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  suburb: z.string().max(120).nullable().optional(),
  postcode: z.string().max(10).nullable().optional(),
  preferredRegion: z.string().max(120).nullable().optional(),
  source: z.enum(POOL_SOURCES).optional(),
  stage: z.enum(POOL_STAGES).optional(),
  vacancyId: z.string().nullable().optional(),
  qualification: z
    .enum(["cert_iii", "diploma", "bachelor", "masters", "other"])
    .nullable()
    .optional(),
  studying: z.boolean().optional(),
  wwccNumber: z.string().max(60).nullable().optional(),
  wwccExpiry: z.coerce.date().nullable().optional(),
  hasFirstAid: z.boolean().optional(),
  rightToWork: z.enum(RIGHT_TO_WORK).nullable().optional(),
  previousRole: z.string().max(200).nullable().optional(),
  previousEmployer: z.string().max(200).nullable().optional(),
  yearsExperience: z.number().int().min(0).max(60).nullable().optional(),
  availableSessions: z.array(z.enum(POOL_SESSIONS)).optional(),
  availableDays: z.array(z.enum(POOL_DAYS)).optional(),
  earliestStart: z.coerce.date().nullable().optional(),
  hasTransport: z.boolean().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  /** Why we didn't hire them — a code, so declines can be counted. */
  notHiredReason: z.enum(NOT_HIRED_REASONS).nullable().optional(),
  notHiredNote: z.string().max(5000).nullable().optional(),
  /** Set when someone actually rings or emails them — drives the stale view. */
  lastContactedAt: z.coerce.date().nullable().optional(),
  archivedAt: z.coerce.date().nullable().optional(),
  resumeFileUrl: z.string().url().nullable().optional(),
  interviewNotes: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  referredByUserId: z.string().nullable().optional(),
});

export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = updateCandidateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    data[field] = value;
  }

  // Auto-update stageChangedAt when stage changes
  if (parsed.data.stage !== undefined) {
    data.stageChangedAt = new Date();
  }

  const candidate = await prisma.recruitmentCandidate.update({
    where: { id },
    data,
    include: candidateInclude,
  });

  return NextResponse.json(candidate);
}, { feature: "recruitment.candidates.manage" });

/**
 * GET    /api/diversity-profile  — caller's own profile (or null)
 * PUT    /api/diversity-profile  — upsert caller's own profile
 * DELETE /api/diversity-profile  — withdraw consent (hard delete)
 *
 * Self-service only. Admin NEVER reads individual diversity data
 * through any surface — the aggregate dashboard at /api/diversity-stats
 * applies min-cell-size suppression.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const GENDERS = [
  "woman",
  "man",
  "non_binary",
  "prefer_to_self_describe",
  "prefer_not_to_say",
] as const;

const INDIGENOUS = [
  "none",
  "aboriginal",
  "torres_strait_islander",
  "both",
  "prefer_not_to_say",
] as const;

const DISABILITY = ["none", "with_disability", "prefer_not_to_say"] as const;

const CARER = [
  "none",
  "parent_carer",
  "family_carer",
  "both",
  "prefer_not_to_say",
] as const;

const putSchema = z.object({
  genderIdentity: z.enum(GENDERS).nullable().optional(),
  genderSelfDescribed: z.string().max(200).nullable().optional(),
  culturalIdentity: z.string().max(200).nullable().optional(),
  bornInAustralia: z.boolean().nullable().optional(),
  yearArrivedInAustralia: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear())
    .nullable()
    .optional(),
  languageAtHome: z.string().max(200).nullable().optional(),
  indigenousIdentity: z.enum(INDIGENOUS).nullable().optional(),
  disabilityStatus: z.enum(DISABILITY).nullable().optional(),
  disabilityType: z.string().max(200).nullable().optional(),
  carerStatus: z.enum(CARER).nullable().optional(),
  veteranStatus: z.boolean().nullable().optional(),
});

export const GET = withApiAuth(async (_req, session) => {
  const profile = await prisma.diversityProfile.findUnique({
    where: { userId: session!.user.id },
  });
  return NextResponse.json({ profile });
});

export const PUT = withApiAuth(async (req, session) => {
  const raw = await parseJsonBody(req);
  const parsed = putSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Validation failed",
      parsed.error.flatten().fieldErrors,
    );
  }
  const data = parsed.data;

  // Refresh consent stamp on every write.
  const consentGivenAt = new Date();

  const profile = await prisma.diversityProfile.upsert({
    where: { userId: session!.user.id },
    create: {
      userId: session!.user.id,
      consentGivenAt,
      ...data,
    },
    update: {
      consentGivenAt,
      ...data,
    },
  });

  logger.info("Diversity profile updated", {
    userId: session!.user.id,
    fieldsTouched: Object.keys(data).filter(
      (k) => data[k as keyof typeof data] !== undefined,
    ),
  });

  return NextResponse.json({ profile });
});

export const DELETE = withApiAuth(async (_req, session) => {
  // Withdrawal — hard delete. Idempotent: if no row exists, succeed silently.
  await prisma.diversityProfile
    .delete({ where: { userId: session!.user.id } })
    .catch((err: unknown) => {
      // P2025 = record not found — fine for an idempotent withdraw.
      const code = (err as { code?: string })?.code;
      if (code === "P2025") return;
      throw err;
    });

  logger.warn("Diversity profile withdrawn", {
    userId: session!.user.id,
  });

  return NextResponse.json({ ok: true });
});

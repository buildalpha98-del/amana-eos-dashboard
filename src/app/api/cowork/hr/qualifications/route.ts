import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
const qualificationSchema = z.object({
  userEmail: z.string().email(),
  type: z.enum(["cert_iii", "diploma", "bachelor", "masters", "first_aid", "wwcc", "other"]),
  name: z.string().min(1),
  institution: z.string().nullable().optional(),
  completedDate: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  certificateUrl: z.string().nullable().optional(),
  verified: z.boolean().optional(),
});

const bodySchema = z.object({
  qualifications: z.array(qualificationSchema).min(1),
});

/**
 * POST /api/cowork/hr/qualifications
 * Upsert staff qualifications (Cert III, Diploma, etc.).
 * Used by: hr-training-needs-scan, hr-pd-opportunity-matcher
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { qualifications } = parsed.data;

    let created = 0,
      updated = 0;

    for (const qual of qualifications) {
      const user = await prisma.user.findFirst({
        where: { email: qual.userEmail },
        select: { id: true },
      });
      if (!user) continue;

      const existing = await prisma.staffQualification.findFirst({
        where: { userId: user.id, type: qual.type, name: qual.name },
      });

      if (existing) {
        await prisma.staffQualification.update({
          where: { id: existing.id },
          data: {
            institution: qual.institution || existing.institution,
            completedDate: qual.completedDate
              ? new Date(qual.completedDate)
              : existing.completedDate,
            expiryDate: qual.expiryDate
              ? new Date(qual.expiryDate)
              : existing.expiryDate,
            certificateUrl: qual.certificateUrl || existing.certificateUrl,
            verified: qual.verified ?? existing.verified,
          },
        });
        updated++;
      } else {
        await prisma.staffQualification.create({
          data: {
            userId: user.id,
            type: qual.type,
            name: qual.name,
            institution: qual.institution || null,
            completedDate: qual.completedDate
              ? new Date(qual.completedDate)
              : null,
            expiryDate: qual.expiryDate ? new Date(qual.expiryDate) : null,
            certificateUrl: qual.certificateUrl || null,
            verified: qual.verified || false,
          },
        });
        created++;
      }
    }

    return NextResponse.json(
      { message: "Qualifications synced", created, updated },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("POST /cowork/hr/qualifications", { err });
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
});

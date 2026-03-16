import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * POST /api/cowork/hr/qualifications
 * Upsert staff qualifications (Cert III, Diploma, etc.).
 * Used by: hr-training-needs-scan, hr-pd-opportunity-matcher
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const body = await req.json();
  const { qualifications } = body;

  if (!qualifications || !Array.isArray(qualifications)) {
    return NextResponse.json(
      { error: "Bad Request", message: "qualifications[] required" },
      { status: 400 }
    );
  }

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
}

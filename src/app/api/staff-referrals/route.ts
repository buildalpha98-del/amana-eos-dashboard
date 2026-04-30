import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

// GET /api/staff-referrals — list referrals (owner/head_office/admin only)
export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const referrals = await prisma.staffReferral.findMany({
      where,
      include: {
        referrerUser: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        candidate: {
          select: { id: true, name: true, email: true, stage: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(referrals);
  },
  { roles: ["owner", "head_office", "admin", "coordinator"] },
);

const createSchema = z.object({
  referrerUserId: z.string().min(1),
  referredName: z.string().min(1),
  referredEmail: z.string().email().optional().nullable(),
  candidateId: z.string().optional().nullable(),
  bonusAmount: z.number().min(0).optional(),
});

// POST /api/staff-referrals — create referral (owner/head_office/admin only)
export const POST = withApiAuth(
  async (req) => {
    const body = await parseJsonBody(req);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const referral = await prisma.staffReferral.create({
      data: { ...parsed.data },
    });
    return NextResponse.json(referral, { status: 201 });
  },
  { feature: "recruitment.candidates.manage" },
);

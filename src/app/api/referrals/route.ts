import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

const createReferralSchema = z.object({
  serviceId: z.string().min(1),
  referrerName: z.string().min(1),
  referredName: z.string().min(1),
  referredEmail: z.string().optional(),
  referredPhone: z.string().optional(),
  referrerContactId: z.string().optional(),
  rewardAmount: z.number().optional(),
});
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (serviceId) where.serviceId = serviceId;
  if (status) where.status = status;

  const referrals = await prisma.referral.findMany({
    where,
    include: {
      service: { select: { id: true, name: true, code: true } },
      referrerContact: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const counts = await prisma.referral.groupBy({
    by: ["status"],
    where: serviceId ? { serviceId } : undefined,
    _count: true,
  });

  const statusCounts: Record<string, number> = {};
  for (const c of counts) {
    statusCounts[c.status] = c._count;
  }

  return NextResponse.json({ referrals, statusCounts });
}, { roles: ["owner", "head_office", "admin"] });

export const POST = withApiAuth(async (req, session) => {
  const body = await req.json();
  const parsed = createReferralSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { serviceId, referrerName, referredName, referredEmail, referredPhone, referrerContactId, rewardAmount } = parsed.data;

  const referral = await prisma.referral.create({
    data: {
      serviceId,
      referrerName,
      referredName,
      referredEmail: referredEmail || null,
      referredPhone: referredPhone || null,
      referrerContactId: referrerContactId || null,
      rewardAmount: rewardAmount ?? 50,
    },
    include: {
      service: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json(referral, { status: 201 });
}, { roles: ["owner", "head_office", "admin"] });

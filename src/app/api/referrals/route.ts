import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

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
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const body = await req.json();
  const { serviceId, referrerName, referredName, referredEmail, referredPhone, referrerContactId, rewardAmount } = body;

  if (!serviceId || !referrerName || !referredName) {
    return NextResponse.json({ error: "serviceId, referrerName, and referredName are required" }, { status: 400 });
  }

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
}

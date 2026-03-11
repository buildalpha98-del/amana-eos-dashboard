import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.status) data.status = body.status;
  if (body.rewardIssuedAt) data.rewardIssuedAt = new Date(body.rewardIssuedAt);
  if (body.rewardAmount !== undefined) data.rewardAmount = body.rewardAmount;

  const referral = await prisma.referral.update({
    where: { id },
    data,
    include: {
      service: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(referral);
}

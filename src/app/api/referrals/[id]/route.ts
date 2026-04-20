import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
const updateReferralSchema = z.object({
  status: z.enum(["pending", "enquired", "enrolled", "rewarded", "expired"]).optional(),
  rewardIssuedAt: z.string().optional(),
  rewardAmount: z.number().optional(),
});
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = updateReferralSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.status) data.status = parsed.data.status;
  if (parsed.data.rewardIssuedAt) data.rewardIssuedAt = new Date(parsed.data.rewardIssuedAt);
  if (parsed.data.rewardAmount !== undefined) data.rewardAmount = parsed.data.rewardAmount;

  const referral = await prisma.referral.update({
    where: { id },
    data,
    include: {
      service: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(referral);
}, { roles: ["owner", "head_office", "admin"] });

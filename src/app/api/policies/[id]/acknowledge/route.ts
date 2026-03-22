import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
// POST /api/policies/[id]/acknowledge — current user acknowledges policy
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const policy = await prisma.policy.findUnique({
    where: { id, deleted: false },
  });

  if (!policy) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  if (policy.status !== "published") {
    return NextResponse.json(
      { error: "Can only acknowledge published policies" },
      { status: 400 }
    );
  }

  // Check if already acknowledged at this version
  const existing = await prisma.policyAcknowledgement.findUnique({
    where: {
      policyId_userId_policyVersion: {
        policyId: id,
        userId: session!.user.id,
        policyVersion: policy.version,
      },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: "Already acknowledged at this version" },
      { status: 409 }
    );
  }

  const acknowledgement = await prisma.policyAcknowledgement.create({
    data: {
      policyId: id,
      userId: session!.user.id,
      policyVersion: policy.version,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "acknowledge",
      entityType: "Policy",
      entityId: id,
      details: { title: policy.title, version: policy.version },
    },
  });

  return NextResponse.json(acknowledgement, { status: 201 });
});

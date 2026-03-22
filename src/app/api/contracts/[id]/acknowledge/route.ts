import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
// POST /api/contracts/[id]/acknowledge — staff acknowledges their own contract
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const contract = await prisma.employmentContract.findUnique({
    where: { id },
  });

  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  // Staff can only acknowledge their own contract
  if (contract.userId !== session!.user.id) {
    return NextResponse.json(
      { error: "You can only acknowledge your own contract" },
      { status: 403 }
    );
  }

  if (contract.acknowledgedByStaff) {
    return NextResponse.json(
      { error: "Contract already acknowledged" },
      { status: 409 }
    );
  }

  const updated = await prisma.employmentContract.update({
    where: { id },
    data: {
      acknowledgedByStaff: true,
      acknowledgedAt: new Date(),
    },
    include: {
      user: {
        select: { id: true, name: true, email: true, avatar: true },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "acknowledge",
      entityType: "EmploymentContract",
      entityId: id,
      details: { contractType: contract.contractType },
    },
  });

  return NextResponse.json(updated);
});

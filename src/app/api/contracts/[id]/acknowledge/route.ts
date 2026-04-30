import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { resolveOnboardingPackForContract } from "@/lib/contracts/onboarding-mapping";

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

  // Contract acknowledged — seed onboarding pack if none exists for this (user, pack) pair.
  try {
    const user = await prisma.user.findUnique({
      where: { id: session!.user.id },
      select: { serviceId: true },
    });
    const pack = await resolveOnboardingPackForContract({
      contractType: contract.contractType,
      userServiceId: user?.serviceId ?? null,
    });
    if (!pack) {
      logger.warn("No OnboardingPack resolvable for contract ack", {
        userId: session!.user.id,
        contractId: id,
        contractType: contract.contractType,
      });
    } else {
      const existing = await prisma.staffOnboarding.findUnique({
        where: { userId_packId: { userId: session!.user.id, packId: pack.id } },
      });
      if (!existing) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 14);
        await prisma.staffOnboarding.create({
          data: {
            userId: session!.user.id,
            packId: pack.id,
            status: "not_started",
            dueDate,
          },
        });
      }
    }
  } catch (err) {
    // Don't fail the ack if seeding errors — log and move on.
    logger.error("Failed to seed onboarding after contract ack (non-fatal)", {
      userId: session!.user.id,
      contractId: id,
      err,
    });
  }

  return NextResponse.json(updated);
});

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

export const DELETE = withApiAuth(async (req, session, context) => {
  const { id, pickupId } = await context!.params!;

  const pickup = await prisma.authorisedPickup.findFirst({
    where: { id: pickupId, childId: id },
  });

  if (!pickup) throw ApiError.notFound("Authorised pickup not found");

  // Soft delete — set active to false
  await prisma.authorisedPickup.update({
    where: { id: pickupId },
    data: { active: false },
  });

  return NextResponse.json({ success: true });
});

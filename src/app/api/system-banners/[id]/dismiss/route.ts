import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
// POST /api/system-banners/[id]/dismiss — dismiss a banner for the current user
export const POST = withApiAuth(async (req, session, context) => {
const { id: bannerId } = await context!.params!;
  const userId = session!.user.id;

  // Check banner exists
  const banner = await prisma.systemBanner.findUnique({
    where: { id: bannerId },
  });
  if (!banner) {
    return NextResponse.json({ error: "Banner not found" }, { status: 404 });
  }

  // Upsert to avoid duplicate dismissals
  await prisma.systemBannerDismissal.upsert({
    where: { bannerId_userId: { bannerId, userId } },
    create: { bannerId, userId },
    update: {},
  });

  return NextResponse.json({ success: true });
});

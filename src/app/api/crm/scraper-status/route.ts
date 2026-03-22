import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/role-permissions";
import type { Role } from "@prisma/client";
import { withApiAuth } from "@/lib/server-auth";

// GET /api/crm/scraper-status
export const GET = withApiAuth(async (req, session) => {
if (!hasFeature(session!.user.role as Role, "crm.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lastRun = await prisma.tenderScrapeRun.findFirst({
    orderBy: { startedAt: "desc" },
  });

  return NextResponse.json(lastRun);
});

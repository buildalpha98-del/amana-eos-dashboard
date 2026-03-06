import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { hasFeature } from "@/lib/role-permissions";
import type { Role } from "@prisma/client";

// GET /api/crm/scraper-status
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  if (!hasFeature(session!.user.role as Role, "crm.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lastRun = await prisma.tenderScrapeRun.findFirst({
    orderBy: { startedAt: "desc" },
  });

  return NextResponse.json(lastRun);
}

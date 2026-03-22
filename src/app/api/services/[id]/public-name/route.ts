import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/services/[id]/public-name
 *
 * Public endpoint — returns only the service name.
 * Used by public survey pages that need to display the centre name
 * without requiring authentication.
 */
export const GET = withApiHandler(async (_req, context) => {
  const { id } = await context!.params!;

  const service = await prisma.service.findUnique({
    where: { id },
    select: { name: true },
  });

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  return NextResponse.json({ name: service.name });
});

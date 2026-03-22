import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/services/public-list
 * Public endpoint — returns only id + name for active services.
 * Used by the public enrolment form to show service options.
 */
export const GET = withApiHandler(async (req) => {
    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(services);
  });

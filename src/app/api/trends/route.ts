import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const category = searchParams.get("category");
  const dismissed = searchParams.get("dismissed") === "true";

  const where: Record<string, unknown> = { dismissed };
  if (serviceId) where.serviceId = serviceId;
  if (category) where.category = category;

  const trends = await prisma.trendInsight.findMany({
    where,
    include: {
      service: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
    take: 50,
  });

  return NextResponse.json(trends);
});

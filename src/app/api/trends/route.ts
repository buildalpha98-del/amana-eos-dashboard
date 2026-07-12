import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { resolveServiceIdFilter } from "@/lib/authz-scope";

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const category = searchParams.get("category");
  const dismissed = searchParams.get("dismissed") === "true";

  const where: Record<string, unknown> = { dismissed };
  // Centre-scope: non-admins only see their own service's trend insights;
  // they can't read other centres by passing a different ?serviceId=.
  const scopedServiceId = resolveServiceIdFilter(session, serviceId);
  if (scopedServiceId) where.serviceId = scopedServiceId;
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

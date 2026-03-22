import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
export const GET = withApiAuth(async (req, session) => {
  const url = new URL(req.url);
  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const serviceId = url.searchParams.get("serviceId") || "";
  const limit = Math.min(Number(url.searchParams.get("limit") || "100"), 200);

  const where: Record<string, unknown> = {};

  if (status && status !== "all") {
    where.status = status;
  }

  if (serviceId) {
    where.serviceId = serviceId;
  }

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { surname: { contains: search, mode: "insensitive" } },
      { schoolName: { contains: search, mode: "insensitive" } },
    ];
  }

  const [children, total] = await Promise.all([
    prisma.child.findMany({
      where,
      include: {
        service: { select: { id: true, name: true, code: true } },
        enrolment: {
          select: {
            id: true,
            primaryParent: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.child.count({ where }),
  ]);

  return NextResponse.json({ children, total });
});

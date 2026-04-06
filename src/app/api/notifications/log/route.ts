import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

async function handler(req: NextRequest) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit = Math.min(100, parseInt(url.searchParams.get("limit") || "50"));

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (status) where.status = status;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const [logs, total, types] = await Promise.all([
    prisma.notificationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notificationLog.count({ where }),
    prisma.notificationLog.findMany({
      select: { type: true },
      distinct: ["type"],
      orderBy: { type: "asc" },
    }),
  ]);

  return NextResponse.json({
    logs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    types: types.map((t) => t.type),
  });
}

export const GET = withApiAuth(handler, { minRole: "coordinator" });

/**
 * GET /api/calls — List VAPI calls with filtering and pagination.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const GET = withApiAuth(async (req) => {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const callType = url.searchParams.get("callType");
  const urgency = url.searchParams.get("urgency");
  const centreName = url.searchParams.get("centreName");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const search = url.searchParams.get("search");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const where: Prisma.VapiCallWhereInput = {};

  if (status) where.status = status;
  if (callType) where.callType = callType;
  if (urgency) where.urgency = urgency;
  if (centreName) where.centreName = centreName;

  if (dateFrom || dateTo) {
    where.calledAt = {};
    if (dateFrom) where.calledAt.gte = new Date(dateFrom);
    if (dateTo) where.calledAt.lte = new Date(dateTo);
  }

  if (search) {
    where.OR = [
      { parentName: { contains: search, mode: "insensitive" } },
      { parentPhone: { contains: search } },
      { childName: { contains: search, mode: "insensitive" } },
    ];
  }

  const [calls, total] = await Promise.all([
    prisma.vapiCall.findMany({
      where,
      orderBy: { calledAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.vapiCall.count({ where }),
  ]);

  return NextResponse.json({ calls, total });
});

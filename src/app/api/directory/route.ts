import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { withApiAuth } from "@/lib/server-auth";

export const GET = withApiAuth(async (req, session) => {
  const url = req.nextUrl;
  const search = url.searchParams.get("search")?.trim() || "";
  const role = url.searchParams.get("role") || "";
  const serviceId = url.searchParams.get("serviceId") || "";

  const where: Prisma.UserWhereInput = { active: true };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  if (role) {
    where.role = role as Prisma.UserWhereInput["role"];
  }

  if (serviceId) {
    where.serviceId = serviceId;
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      avatar: true,
      serviceId: true,
      service: { select: { name: true, code: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
});

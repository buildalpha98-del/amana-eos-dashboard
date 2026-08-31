import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { withApiAuth } from "@/lib/server-auth";
import { resolveServiceIdFilter } from "@/lib/authz-scope";

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

  // Centre-scope: non-admins only see their own service's directory; they
  // can't enumerate other centres' staff by passing a different ?serviceId=.
  const scopedServiceId = resolveServiceIdFilter(session, serviceId);
  if (scopedServiceId) {
    where.serviceId = scopedServiceId;
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

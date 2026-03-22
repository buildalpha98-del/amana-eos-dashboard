import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
export const GET = withApiAuth(async (req, session) => {
  const templates = await prisma.marketingTaskTemplate.findMany({
    include: { items: { orderBy: { sortOrder: "asc" } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(templates);
}, { roles: ["owner", "head_office", "admin", "marketing"] });

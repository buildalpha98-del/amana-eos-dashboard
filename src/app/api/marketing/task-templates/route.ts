import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

export async function GET() {
  const { error } = await requireAuth(["owner", "head_office", "admin", "marketing"]);
  if (error) return error;

  const templates = await prisma.marketingTaskTemplate.findMany({
    include: { items: { orderBy: { sortOrder: "asc" } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(templates);
}

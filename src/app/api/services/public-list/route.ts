import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/services/public-list
 * Public endpoint — returns only id + name for active services.
 * Used by the public enrolment form to show service options.
 */
export async function GET() {
  try {
    const services = await prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(services);
  } catch (e) {
    console.error("Public service list error:", e);
    return NextResponse.json([], { status: 500 });
  }
}

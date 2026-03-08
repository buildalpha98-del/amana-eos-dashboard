import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const isConfigured = !!(process.env.OWNA_API_URL && process.env.OWNA_API_KEY);

  const services = await prisma.service.findMany({
    where: { status: "active" },
    select: {
      id: true,
      name: true,
      code: true,
      ownaServiceId: true,
      ownaLocationId: true,
      ownaSyncedAt: true,
    },
    orderBy: { name: "asc" },
  });

  const mappedCount = services.filter((s) => s.ownaServiceId).length;

  return NextResponse.json({
    configured: isConfigured,
    services,
    mappedCount,
    totalServices: services.length,
  });
}

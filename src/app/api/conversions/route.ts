import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/conversions — list opportunities with filters
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const status = searchParams.get("status");
  const sessionType = searchParams.get("sessionType");

  const where: Record<string, unknown> = {};
  if (serviceId) where.serviceId = serviceId;
  if (status) where.status = status;
  if (sessionType) where.sessionType = sessionType;

  const opportunities = await prisma.conversionOpportunity.findMany({
    where,
    include: {
      service: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ casualCount: "desc" }, { createdAt: "desc" }],
  });

  // Summary stats
  const stats = {
    total: opportunities.length,
    identified: opportunities.filter((o) => o.status === "identified").length,
    contacted: opportunities.filter((o) => o.status === "contacted").length,
    converted: opportunities.filter((o) => o.status === "converted").length,
    declined: opportunities.filter((o) => o.status === "declined").length,
    totalCasualBookings: opportunities.reduce((s, o) => s + o.casualCount, 0),
  };

  return NextResponse.json({ opportunities, stats });
}

// PATCH /api/conversions — update status
export async function PATCH(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const { id, status, notes } = body as {
    id: string;
    status: string;
    notes?: string;
  };

  if (!id || !status) {
    return NextResponse.json(
      { error: "id and status are required" },
      { status: 400 }
    );
  }

  const validStatuses = ["identified", "contacted", "converted", "declined"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `Status must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = { status };
  if (status === "contacted") data.contactedAt = new Date();
  if (status === "converted") data.convertedAt = new Date();
  if (notes !== undefined) data.notes = notes;

  const updated = await prisma.conversionOpportunity.update({
    where: { id },
    data,
    include: {
      service: { select: { id: true, name: true, code: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "ConversionOpportunity",
      entityId: updated.id,
      details: { status, familyRef: updated.familyRef },
    },
  });

  return NextResponse.json(updated);
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/vto — get the V/TO with 1-year goals
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const vto = await prisma.visionTractionOrganiser.findFirst({
    include: {
      oneYearGoals: {
        orderBy: { createdAt: "asc" },
        include: {
          rocks: {
            where: { deleted: false },
            select: { id: true, title: true, status: true, percentComplete: true },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      updatedBy: { select: { id: true, name: true } },
    },
  });

  if (!vto) {
    return NextResponse.json({ error: "No V/TO found" }, { status: 404 });
  }

  return NextResponse.json(vto);
}

// PATCH /api/vto — update V/TO fields
export async function PATCH(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();

  const vto = await prisma.visionTractionOrganiser.findFirst();
  if (!vto) {
    return NextResponse.json({ error: "No V/TO found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (body.coreValues !== undefined) data.coreValues = body.coreValues;
  if (body.corePurpose !== undefined) data.corePurpose = body.corePurpose;
  if (body.coreNiche !== undefined) data.coreNiche = body.coreNiche;
  if (body.tenYearTarget !== undefined) data.tenYearTarget = body.tenYearTarget;
  if (body.threeYearPicture !== undefined) data.threeYearPicture = body.threeYearPicture;
  if (body.marketingStrategy !== undefined) data.marketingStrategy = body.marketingStrategy;

  data.updatedById = session!.user.id;

  const updated = await prisma.visionTractionOrganiser.update({
    where: { id: vto.id },
    data,
    include: {
      oneYearGoals: {
        orderBy: { createdAt: "asc" },
        include: {
          rocks: {
            where: { deleted: false },
            select: { id: true, title: true, status: true, percentComplete: true },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      updatedBy: { select: { id: true, name: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "VTO",
      entityId: updated.id,
      details: { fields: Object.keys(data).filter((k) => k !== "updatedById") },
    },
  });

  return NextResponse.json(updated);
}

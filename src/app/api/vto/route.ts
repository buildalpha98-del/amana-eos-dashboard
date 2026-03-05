import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateVtoSchema = z.object({
  coreValues: z.array(z.string()).optional(),
  corePurpose: z.string().nullable().optional(),
  coreNiche: z.string().nullable().optional(),
  tenYearTarget: z.string().nullable().optional(),
  threeYearPicture: z.string().nullable().optional(),
  marketingStrategy: z.string().nullable().optional(),
  sectionLabels: z.record(z.string(), z.string()).nullable().optional(),
});

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
  const parsed = updateVtoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const vto = await prisma.visionTractionOrganiser.findFirst();
  if (!vto) {
    return NextResponse.json({ error: "No V/TO found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (parsed.data.coreValues !== undefined) data.coreValues = parsed.data.coreValues;
  if (parsed.data.corePurpose !== undefined) data.corePurpose = parsed.data.corePurpose;
  if (parsed.data.coreNiche !== undefined) data.coreNiche = parsed.data.coreNiche;
  if (parsed.data.tenYearTarget !== undefined) data.tenYearTarget = parsed.data.tenYearTarget;
  if (parsed.data.threeYearPicture !== undefined) data.threeYearPicture = parsed.data.threeYearPicture;
  if (parsed.data.marketingStrategy !== undefined) data.marketingStrategy = parsed.data.marketingStrategy;
  if (parsed.data.sectionLabels !== undefined) data.sectionLabels = parsed.data.sectionLabels;

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

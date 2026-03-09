import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/marketing/campaigns/:id/activations — list activation assignments
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;

  const assignments = await prisma.campaignActivationAssignment.findMany({
    where: { campaignId: id },
    include: {
      service: { select: { id: true, name: true, code: true } },
      coordinator: { select: { id: true, name: true } },
    },
    orderBy: { service: { name: "asc" } },
  });

  return NextResponse.json(assignments);
}

// PUT /api/marketing/campaigns/:id/activations — bulk upsert assignments
const assignmentSchema = z.object({
  serviceId: z.string(),
  assigned: z.boolean().optional(),
  coordinatorId: z.string().nullable().optional(),
  budget: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.string().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = z.array(assignmentSchema).safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const results = await Promise.all(
    parsed.data.map((a) =>
      prisma.campaignActivationAssignment.upsert({
        where: {
          campaignId_serviceId: { campaignId: id, serviceId: a.serviceId },
        },
        create: { campaignId: id, ...a },
        update: a,
      })
    )
  );

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "updated_activation_assignments",
      entityType: "MarketingCampaign",
      entityId: id,
      details: `Updated ${results.length} centre activation assignments`,
    },
  });

  return NextResponse.json(results);
}

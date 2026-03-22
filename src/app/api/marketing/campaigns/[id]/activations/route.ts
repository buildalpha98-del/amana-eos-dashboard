import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
// GET /api/marketing/campaigns/:id/activations — list activation assignments
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const assignments = await prisma.campaignActivationAssignment.findMany({
    where: { campaignId: id },
    include: {
      service: { select: { id: true, name: true, code: true } },
      coordinator: { select: { id: true, name: true } },
    },
    orderBy: { service: { name: "asc" } },
  });

  return NextResponse.json(assignments);
}, { roles: ["owner", "head_office", "admin", "marketing"] });

// PUT /api/marketing/campaigns/:id/activations — bulk upsert assignments
const assignmentSchema = z.object({
  serviceId: z.string(),
  assigned: z.boolean().optional(),
  coordinatorId: z.string().nullable().optional(),
  budget: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.string().optional(),
});

export const PUT = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
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
}, { roles: ["owner", "head_office", "admin", "marketing"] });

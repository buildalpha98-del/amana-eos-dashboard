import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const updateVtoSchema = z.object({
  coreValues: z.array(z.string()).optional(),
  corePurpose: z.string().nullable().optional(),
  coreNiche: z.string().nullable().optional(),
  tenYearTarget: z.string().nullable().optional(),
  threeYearPicture: z.string().nullable().optional(),
  // 2026-06-23: structured 3-Year Picture sub-fields. threeYearPicture
  // is kept for back-compat as a legacy block, same pattern as the
  // GTM migration.
  threeYearFutureDate: z.string().nullable().optional(),
  threeYearRevenue: z.string().nullable().optional(),
  threeYearProfit: z.string().nullable().optional(),
  threeYearMeasurables: z.string().nullable().optional(),
  threeYearLooksLike: z.string().nullable().optional(),
  marketingStrategy: z.string().nullable().optional(),
  // Go to Market Strategy — four EOS sub-fields that replace the
  // single freeform marketingStrategy block.
  gtmTargetMarket: z.string().nullable().optional(),
  gtmThreeUniques: z.string().nullable().optional(),
  gtmProvenProcess: z.string().nullable().optional(),
  gtmGuarantee: z.string().nullable().optional(),
  sectionLabels: z.record(z.string(), z.string()).nullable().optional(),
});

// GET /api/vto — get the V/TO with 1-year goals
export const GET = withApiAuth(async (req, session) => {
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
});

// PATCH /api/vto — update V/TO fields
export const PATCH = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
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
  if (parsed.data.threeYearFutureDate !== undefined) {
    data.threeYearFutureDate = parsed.data.threeYearFutureDate
      ? new Date(parsed.data.threeYearFutureDate)
      : null;
  }
  if (parsed.data.threeYearRevenue !== undefined) data.threeYearRevenue = parsed.data.threeYearRevenue;
  if (parsed.data.threeYearProfit !== undefined) data.threeYearProfit = parsed.data.threeYearProfit;
  if (parsed.data.threeYearMeasurables !== undefined) data.threeYearMeasurables = parsed.data.threeYearMeasurables;
  if (parsed.data.threeYearLooksLike !== undefined) data.threeYearLooksLike = parsed.data.threeYearLooksLike;
  if (parsed.data.marketingStrategy !== undefined) data.marketingStrategy = parsed.data.marketingStrategy;
  if (parsed.data.gtmTargetMarket !== undefined) data.gtmTargetMarket = parsed.data.gtmTargetMarket;
  if (parsed.data.gtmThreeUniques !== undefined) data.gtmThreeUniques = parsed.data.gtmThreeUniques;
  if (parsed.data.gtmProvenProcess !== undefined) data.gtmProvenProcess = parsed.data.gtmProvenProcess;
  if (parsed.data.gtmGuarantee !== undefined) data.gtmGuarantee = parsed.data.gtmGuarantee;
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
}, { roles: ["owner", "head_office", "admin", "eos_implementer"] });

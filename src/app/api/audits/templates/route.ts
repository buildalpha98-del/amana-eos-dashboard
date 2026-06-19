import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const postSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  // 2026-06-19: QA + NQS are now optional. Doc-mode audits typically
  // span multiple QAs (an "annual operations audit") and shouldn't
  // be forced to pick one. Defaults applied server-side when omitted.
  qualityArea: z.number().optional(),
  nqsReference: z.string().optional(),
  frequency: z.enum([
    "daily",
    "weekly",
    "monthly",
    "quarterly",
    "half_yearly",
    "yearly",
  ]),
  scheduledMonths: z.array(z.number()),
  responseFormat: z.enum(["yes_no", "rating_1_5", "compliant", "reverse_yes_no", "review_date", "inventory"]).optional(),
  estimatedMinutes: z.number().optional(),
  // 2026-06-19: document-mode templates carry the DOCX itself
  // (Blob URL) instead of structured items. Coordinators edit the
  // doc per-instance via the inline editor.
  sourceFileUrl: z.string().url().optional(),
  documentMode: z.boolean().optional(),
  sourceFileName: z.string().optional(),
});
/**
 * GET /api/audits/templates — list audit templates
 */
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const qualityArea = searchParams.get("qualityArea");
  const frequency = searchParams.get("frequency");
  const activeOnly = searchParams.get("activeOnly") !== "false";

  const where: Record<string, unknown> = {};
  if (activeOnly) where.isActive = true;
  if (qualityArea) where.qualityArea = parseInt(qualityArea);
  if (frequency) where.frequency = frequency;

  const templates = await prisma.auditTemplate.findMany({
    where,
    include: {
      _count: { select: { items: true, instances: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(templates);
});

/**
 * POST /api/audits/templates — create a new template (admin only)
 */
export const POST = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const {
    name,
    description,
    qualityArea,
    nqsReference,
    frequency,
    scheduledMonths,
    responseFormat,
    estimatedMinutes,
    sourceFileUrl,
    documentMode,
    sourceFileName,
  } = parsed.data;

  const template = await prisma.auditTemplate.create({
    data: {
      name,
      description,
      // Default to QA2 (Health & Safety) when the modal didn't ask —
      // matches the bulk of OSHC compliance audits. Admins can edit
      // this later on the template.
      qualityArea: qualityArea ?? 2,
      nqsReference: nqsReference ?? "—",
      frequency,
      scheduledMonths,
      responseFormat: responseFormat || "yes_no",
      estimatedMinutes,
      sourceFileUrl,
      documentMode: documentMode ?? false,
      sourceFileName,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "AuditTemplate",
      entityId: template.id,
      details: { name },
    },
  });

  return NextResponse.json(template, { status: 201 });
}, { roles: ["owner", "head_office", "admin"] });

/**
 * DELETE /api/audits/templates — wipe every audit template (owner only).
 *
 * Deletes every AuditTemplate row. Cascades to AuditTemplateItem,
 * AuditInstance, AuditItemResponse and any per-instance reflection/
 * review rows via the existing onDelete: Cascade FKs. Use only for a
 * clean-slate reset of the audit subsystem — there is no undo.
 *
 * Owner only. Per-template delete (DELETE /api/audits/templates/[id])
 * stays as the gentler option.
 */
export const DELETE = withApiAuth(
  async (_req, session) => {
    const counts = {
      templates: await prisma.auditTemplate.count(),
      items: await prisma.auditTemplateItem.count(),
      instances: await prisma.auditInstance.count(),
    };

    await prisma.auditTemplate.deleteMany({});

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "wipe_all",
        entityType: "AuditTemplate",
        entityId: "*",
        details: { ...counts, reason: "owner-initiated reset of audit subsystem" },
      },
    });

    return NextResponse.json({ ok: true, wiped: counts });
  },
  { roles: ["owner"] },
);

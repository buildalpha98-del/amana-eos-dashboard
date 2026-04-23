import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  qualityArea: z.number().optional(),
  nqsReference: z.string().optional(),
  frequency: z.enum(["monthly", "half_yearly", "yearly"]).optional(),
  scheduledMonths: z.array(z.number().int().min(1).max(12)).optional(),
  responseFormat: z.enum(["yes_no", "rating_1_5", "compliant", "reverse_yes_no", "review_date", "inventory"]).optional(),
  estimatedMinutes: z.number().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
  sourceFileName: z.string().optional(),
  respreadFutureInstances: z.boolean().optional(),
});
/**
 * GET /api/audits/templates/[id] — template detail with items
 */
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const template = await prisma.auditTemplate.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      _count: { select: { instances: true } },
    },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json(template);
});

/**
 * PATCH /api/audits/templates/[id] — update template (admin/owner)
 *
 * If `respreadFutureInstances: true` AND scheduledMonths is being changed,
 * scheduled+future instances that are no longer on the new months are deleted
 * and recreated in the new months (cascade removes their response rows).
 * In-progress, completed, past-due, and past-year instances are never touched.
 */
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { respreadFutureInstances, ...fields } = parsed.data;

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) data[key] = value;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  let template;
  try {
    template = await prisma.auditTemplate.update({
      where: { id },
      data,
      include: {
        items: { orderBy: { sortOrder: "asc" } },
        _count: { select: { instances: true } },
      },
    });
  } catch (err: unknown) {
    const e = err as { code?: string; meta?: { target?: string[] } };
    if (e.code === "P2002" && e.meta?.target?.includes("name")) {
      return NextResponse.json(
        { error: "A template with this name already exists." },
        { status: 409 },
      );
    }
    throw err;
  }

  let respread: { deleted: number; recreated: number } | undefined;

  // Respread only when: flag is true AND scheduledMonths is in the body AND
  // the template has existing instances. Limited to scheduled+future (by
  // dueDate) instances within the current year or later.
  if (
    respreadFutureInstances === true &&
    fields.scheduledMonths !== undefined &&
    template._count.instances > 0
  ) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const newMonths = fields.scheduledMonths as number[];

    const eligible = await prisma.auditInstance.findMany({
      where: {
        templateId: id,
        status: "scheduled",
        dueDate: { gte: now },
        scheduledYear: { gte: currentYear },
      },
      select: {
        id: true,
        serviceId: true,
        scheduledMonth: true,
        scheduledYear: true,
      },
    });

    // Partition: keep if already on a new month, otherwise delete and recreate
    // on the new months for the same (serviceId, year).
    const toDelete: string[] = [];
    const toRecreate: Array<{ serviceId: string; scheduledYear: number }> = [];
    const seenPairs = new Set<string>();

    for (const inst of eligible) {
      const pairKey = `${inst.serviceId}:${inst.scheduledYear}`;
      if (newMonths.includes(inst.scheduledMonth)) {
        // Already on a new month — leave alone. Still track the pair so we
        // know to fill in missing new months for this service/year below.
        if (!seenPairs.has(pairKey)) {
          toRecreate.push({ serviceId: inst.serviceId, scheduledYear: inst.scheduledYear });
          seenPairs.add(pairKey);
        }
      } else {
        toDelete.push(inst.id);
        if (!seenPairs.has(pairKey)) {
          toRecreate.push({ serviceId: inst.serviceId, scheduledYear: inst.scheduledYear });
          seenPairs.add(pairKey);
        }
      }
    }

    let deleted = 0;
    if (toDelete.length > 0) {
      const result = await prisma.auditInstance.deleteMany({
        where: { id: { in: toDelete } },
      });
      deleted = result.count;
    }

    let recreated = 0;
    for (const { serviceId, scheduledYear } of toRecreate) {
      for (const month of newMonths) {
        const existing = await prisma.auditInstance.findUnique({
          where: {
            templateId_serviceId_scheduledMonth_scheduledYear: {
              templateId: id,
              serviceId,
              scheduledMonth: month,
              scheduledYear,
            },
          },
        });
        if (existing) continue;

        const dueDate = new Date(scheduledYear, month, 0);
        dueDate.setHours(23, 59, 59, 999);

        await prisma.auditInstance.create({
          data: {
            templateId: id,
            serviceId,
            scheduledMonth: month,
            scheduledYear,
            dueDate,
            status: "scheduled",
            totalItems: template.items.length,
            responses: {
              create: template.items.map((item) => ({
                templateItemId: item.id,
                result: "not_answered",
              })),
            },
          },
        });
        recreated++;
      }
    }

    respread = { deleted, recreated };
  }

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "AuditTemplate",
      entityId: id,
      details: { updated: Object.keys(data), ...(respread ? { respread } : {}) },
    },
  });

  return NextResponse.json({ ...template, ...(respread ? { respread } : {}) });
}, { roles: ["owner", "head_office", "admin"] });

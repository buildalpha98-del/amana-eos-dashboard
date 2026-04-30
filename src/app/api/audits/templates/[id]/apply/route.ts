import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";
import { parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const applySchema = z.object({
  serviceIds: z.array(z.string().min(1)).min(1, "serviceIds must be non-empty"),
  year: z.number().int().min(2020).max(2100),
  months: z
    .array(z.number().int().min(1).max(12))
    .min(1, "months must be non-empty when provided")
    .optional(),
});

/**
 * POST /api/audits/templates/[id]/apply
 *
 * Bulk-generate AuditInstance records for a template across the selected
 * services and year. Defaults to the template's own scheduledMonths when
 * no months override is supplied. Existing instances (matched via the
 * template × service × month × year unique key) are skipped, not updated.
 */
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id: templateId } = await context!.params!;
    const body = await parseJsonBody(req);
    const parsed = applySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { serviceIds, year, months: monthsOverride } = parsed.data;

    const template = await prisma.auditTemplate.findUnique({
      where: { id: templateId },
      include: {
        items: { select: { id: true }, orderBy: { sortOrder: "asc" } },
      },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const months = monthsOverride ?? template.scheduledMonths;
    if (months.length === 0) {
      return NextResponse.json(
        { error: "Template has no scheduledMonths and no months override was provided" },
        { status: 400 },
      );
    }

    // Filter to services that exist and are active. Unknown/inactive ids are
    // surfaced in the response so the client can show a warning.
    const activeServices = await prisma.service.findMany({
      where: { id: { in: serviceIds }, status: "active" },
      select: { id: true },
    });
    const activeIds = new Set(activeServices.map((s) => s.id));
    const unknownServiceIds = serviceIds.filter((id) => !activeIds.has(id));
    const validServiceIds = serviceIds.filter((id) => activeIds.has(id));

    let created = 0;
    let skipped = 0;

    try {
      for (const serviceId of validServiceIds) {
        // Wrap each service's per-month writes in a transaction so a partial
        // failure for one service doesn't leave orphan instances.
        await prisma.$transaction(async (tx) => {
          for (const month of months) {
            const existing = await tx.auditInstance.findUnique({
              where: {
                templateId_serviceId_scheduledMonth_scheduledYear: {
                  templateId,
                  serviceId,
                  scheduledMonth: month,
                  scheduledYear: year,
                },
              },
            });

            if (existing) {
              skipped++;
              continue;
            }

            const dueDate = new Date(year, month, 0);
            dueDate.setHours(23, 59, 59, 999);

            await tx.auditInstance.create({
              data: {
                templateId,
                serviceId,
                scheduledMonth: month,
                scheduledYear: year,
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

            created++;
          }
        });
      }

      await prisma.activityLog.create({
        data: {
          userId: session!.user.id,
          action: "apply",
          entityType: "AuditTemplate",
          entityId: templateId,
          details: {
            serviceCount: validServiceIds.length,
            year,
            months,
            created,
            skipped,
            unknownServiceCount: unknownServiceIds.length,
          },
        },
      });

      return NextResponse.json({
        created,
        skipped,
        total: created + skipped,
        serviceIds: validServiceIds,
        ...(unknownServiceIds.length > 0 ? { unknownServiceIds } : {}),
      });
    } catch (err) {
      logger.error("Apply template to services failed", { err, templateId });
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "Failed to apply template",
        },
        { status: 500 },
      );
    }
  },
  {
    roles: ["owner", "head_office", "admin"],
    rateLimit: { max: 20, windowMs: 60000 },
  },
);

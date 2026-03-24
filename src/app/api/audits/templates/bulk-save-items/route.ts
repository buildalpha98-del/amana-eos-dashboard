import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const responseFormatEnum = z.enum([
  "yes_no",
  "rating_1_5",
  "compliant",
  "reverse_yes_no",
  "review_date",
  "inventory",
]);

const itemSchema = z.object({
  section: z.string().nullable(),
  question: z.string().min(1),
  guidance: z.string().nullable(),
  responseFormat: responseFormatEnum,
});

const templateEntrySchema = z.object({
  templateId: z.string().min(1),
  responseFormat: responseFormatEnum,
  items: z.array(itemSchema).min(1),
});

const bodySchema = z.object({
  templates: z.array(templateEntrySchema).min(1),
});

/**
 * POST /api/audits/templates/bulk-save-items
 *
 * Saves parsed audit questions to existing templates in bulk.
 * For each template: deletes existing items, creates new ones, updates responseFormat.
 */
export const POST = withApiAuth(
  async (req, session) => {
    const body = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { templates } = parsed.data;
    const templateIds = templates.map((t) => t.templateId);

    // Verify all templates exist
    const existing = await prisma.auditTemplate.findMany({
      where: { id: { in: templateIds }, isActive: true },
      select: { id: true, name: true },
    });

    const existingIds = new Set(existing.map((t) => t.id));
    const missing = templateIds.filter((id) => !existingIds.has(id));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Templates not found: ${missing.join(", ")}` },
        { status: 404 },
      );
    }

    // Process all templates in a single transaction
    const results = await prisma.$transaction(async (tx) => {
      const out: Array<{ templateId: string; templateName: string; itemsCreated: number }> = [];

      for (const entry of templates) {
        // Delete existing items for this template
        await tx.auditTemplateItem.deleteMany({
          where: { templateId: entry.templateId },
        });

        // Create new items with sortOrder
        await tx.auditTemplateItem.createMany({
          data: entry.items.map((item, idx) => ({
            templateId: entry.templateId,
            section: item.section,
            question: item.question,
            guidance: item.guidance,
            responseFormat: item.responseFormat,
            sortOrder: idx + 1,
            isRequired: true,
          })),
        });

        // Update template responseFormat
        await tx.auditTemplate.update({
          where: { id: entry.templateId },
          data: { responseFormat: entry.responseFormat },
        });

        const tpl = existing.find((t) => t.id === entry.templateId)!;
        out.push({
          templateId: entry.templateId,
          templateName: tpl.name,
          itemsCreated: entry.items.length,
        });
      }

      // Log activity
      await tx.activityLog.create({
        data: {
          userId: session!.user.id,
          action: "bulk_import_items",
          entityType: "AuditTemplate",
          entityId: templateIds[0],
          details: {
            templateCount: templates.length,
            totalItems: templates.reduce((sum, t) => sum + t.items.length, 0),
            templateIds,
          },
        },
      });

      return out;
    });

    logger.info("Bulk audit items saved", {
      userId: session!.user.id,
      templateCount: results.length,
      totalItems: results.reduce((sum, r) => sum + r.itemsCreated, 0),
    });

    return NextResponse.json({
      message: `Saved questions for ${results.length} audit templates`,
      results,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);

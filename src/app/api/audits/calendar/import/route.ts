import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseComplianceCalendar, parseCalendarCsv } from "@/lib/audit-calendar-parser";
import type { AuditFrequency } from "@prisma/client";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { validateFileContent } from "@/lib/file-validation";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/csv",
  "application/csv",
];

/**
 * POST /api/audits/calendar/import
 *
 * Upload a compliance calendar .docx document. Parses it and upserts
 * AuditTemplate records. Optionally generates AuditInstance records for
 * each template × active service for the specified year.
 *
 * Form fields:
 *  - file: .docx file (required)
 *  - generateInstances: "true" to auto-create instances (optional)
 *  - year: target year for instances, defaults to current year (optional)
 *  - preview: "true" to only return parsed data without writing to DB (optional)
 */
export const POST = withApiAuth(async (req, session) => {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const generateInstances = formData.get("generateInstances") === "true";
  const yearStr = formData.get("year") as string | null;
  const preview = formData.get("preview") === "true";
  const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const isCSV = file.name.endsWith(".csv") || file.type === "text/csv" || file.type === "application/csv";

  if (
    !isCSV &&
    !ALLOWED_TYPES.includes(file.type) &&
    !file.name.endsWith(".docx") &&
    !file.name.endsWith(".doc")
  ) {
    return NextResponse.json(
      { error: "Only .docx, .doc, and .csv files are supported" },
      { status: 400 },
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File exceeds 10 MB limit" },
      { status: 400 },
    );
  }

  const arrayBuf = await file.arrayBuffer();
  if (!isCSV && !validateFileContent(arrayBuf, file.type)) {
    return NextResponse.json(
      { error: "File content does not match declared type" },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(arrayBuf);
    const parsed = isCSV
      ? parseCalendarCsv(buffer.toString("utf-8"))
      : await parseComplianceCalendar(buffer);

    if (parsed.templates.length === 0) {
      return NextResponse.json(
        {
          error:
            "No audit templates found in the document. Ensure it follows the compliance calendar format with QA area detail tables.",
        },
        { status: 422 },
      );
    }

    // Preview mode: return parsed data without writing to DB
    if (preview) {
      return NextResponse.json({
        preview: true,
        ...parsed,
      });
    }

    // Upsert templates
    let created = 0;
    let updated = 0;
    const templateRecords: Array<{
      id: string;
      name: string;
      qualityArea: number;
      frequency: string;
      scheduledMonths: number[];
      isNew: boolean;
    }> = [];

    for (const entry of parsed.templates) {
      // Try to find existing template by name (case-insensitive)
      const existing = await prisma.auditTemplate.findFirst({
        where: {
          name: { equals: entry.name, mode: "insensitive" },
        },
      });

      if (existing) {
        // Update existing template
        const updatedTemplate = await prisma.auditTemplate.update({
          where: { id: existing.id },
          data: {
            description: entry.description || existing.description,
            qualityArea: entry.qualityArea || existing.qualityArea,
            nqsReference: entry.nqsReference || existing.nqsReference,
            frequency: entry.frequency as AuditFrequency,
            scheduledMonths: entry.scheduledMonths,
            isActive: true,
          },
        });
        updated++;
        templateRecords.push({
          id: updatedTemplate.id,
          name: updatedTemplate.name,
          qualityArea: updatedTemplate.qualityArea,
          frequency: updatedTemplate.frequency,
          scheduledMonths: updatedTemplate.scheduledMonths,
          isNew: false,
        });
      } else {
        // Create new template
        const newTemplate = await prisma.auditTemplate.create({
          data: {
            name: entry.name,
            description: entry.description || null,
            qualityArea: entry.qualityArea || 1,
            nqsReference: entry.nqsReference || "",
            frequency: entry.frequency as AuditFrequency,
            scheduledMonths: entry.scheduledMonths,
            responseFormat: "yes_no",
            isActive: true,
            sourceFileName: file.name,
          },
        });
        created++;
        templateRecords.push({
          id: newTemplate.id,
          name: newTemplate.name,
          qualityArea: newTemplate.qualityArea,
          frequency: newTemplate.frequency,
          scheduledMonths: newTemplate.scheduledMonths,
          isNew: true,
        });
      }
    }

    // Optionally generate instances
    let instancesCreated = 0;
    let instancesSkipped = 0;

    if (generateInstances) {
      const services = await prisma.service.findMany({
        where: { status: "active" },
        select: { id: true, name: true },
      });

      // Get all templates with their items for instance creation
      const templatesWithItems = await prisma.auditTemplate.findMany({
        where: {
          id: { in: templateRecords.map((t) => t.id) },
          isActive: true,
        },
        include: {
          items: { select: { id: true }, orderBy: { sortOrder: "asc" } },
        },
      });

      const now = new Date();
      const currentMonth = now.getMonth() + 1;

      for (const template of templatesWithItems) {
        for (const month of template.scheduledMonths) {
          // Skip months that have already passed this year
          if (year === now.getFullYear() && month < currentMonth) continue;

          // Due date = last day of the scheduled month
          const dueDate = new Date(year, month, 0);
          dueDate.setHours(23, 59, 59, 999);

          for (const service of services) {
            // Check if instance already exists
            const existing = await prisma.auditInstance.findUnique({
              where: {
                templateId_serviceId_scheduledMonth_scheduledYear: {
                  templateId: template.id,
                  serviceId: service.id,
                  scheduledMonth: month,
                  scheduledYear: year,
                },
              },
            });

            if (existing) {
              instancesSkipped++;
              continue;
            }

            // Create instance + response records
            await prisma.auditInstance.create({
              data: {
                templateId: template.id,
                serviceId: service.id,
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

            instancesCreated++;
          }
        }
      }
    }

    return NextResponse.json({
      message: "Calendar imported successfully",
      templatesCreated: created,
      templatesUpdated: updated,
      totalTemplates: parsed.templates.length,
      instancesCreated,
      instancesSkipped,
      templates: templateRecords,
    });
  } catch (err) {
    logger.error("Calendar import error", { err });
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to import calendar",
      },
      { status: 500 },
    );
  }
}, { roles: ["owner", "head_office", "admin"] });

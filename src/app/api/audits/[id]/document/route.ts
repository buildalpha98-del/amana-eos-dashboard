import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ensureCoordCanTouchAudit } from "../../_lib/scope";
import { scanAuditForFlags } from "@/lib/audit-ai-scan";
import { logger } from "@/lib/logger";

// Force Node runtime — mammoth needs Buffer + Node streams.
export const runtime = "nodejs";

/**
 * Document-mode audit endpoint.
 *
 *   GET — returns the HTML the staff editor should load. If the
 *         audit already has `completedHtml` saved, return that.
 *         Otherwise fetch the template's source .docx from Blob and
 *         convert it with mammoth. Template DOCX is never modified.
 *
 *   PATCH — save the edited HTML. `complete: true` also flips the
 *           instance to "completed".
 */

const patchSchema = z.object({
  completedHtml: z.string().min(1, "completedHtml is required"),
  complete: z.boolean().optional(),
});

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;

  const instance = await prisma.auditInstance.findUnique({
    where: { id },
    include: {
      template: {
        select: {
          id: true,
          name: true,
          documentMode: true,
          sourceFileUrl: true,
          sourceFileName: true,
          sourceHtml: true,
        },
      },
    },
  });

  if (!instance) throw new ApiError(404, "Audit not found");

  ensureCoordCanTouchAudit(
    session!.user.role ?? "",
    (session!.user as { serviceId?: string | null }).serviceId,
    instance.serviceId,
  );

  if (!instance.template.documentMode) {
    throw new ApiError(
      400,
      "Not a document-mode audit. Use the questionnaire form.",
    );
  }

  const responseExtras = {
    sourceFileName: instance.template.sourceFileName,
    aiFlags: instance.aiFlags ?? null,
    aiSummary: instance.aiSummary ?? null,
    aiScannedAt: instance.aiScannedAt
      ? instance.aiScannedAt.toISOString()
      : null,
  };

  if (instance.completedHtml) {
    return NextResponse.json({
      html: instance.completedHtml,
      source: "saved" as const,
      ...responseExtras,
    });
  }

  // 2026-06-24: use the template's cached sourceHtml if present —
  // converted once at first preview, edited by admin, reused for
  // every new instance.
  if (instance.template.sourceHtml) {
    return NextResponse.json({
      html: instance.template.sourceHtml,
      source: "template" as const,
      ...responseExtras,
    });
  }

  if (!instance.template.sourceFileUrl) {
    throw new ApiError(
      400,
      "Document-mode audit has no source file. Re-upload the template.",
    );
  }

  const docRes = await fetch(instance.template.sourceFileUrl, {
    cache: "no-store",
  });
  if (!docRes.ok) {
    throw new ApiError(
      502,
      `Couldn't fetch source document (${docRes.status}).`,
    );
  }
  const arrayBuffer = await docRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Dynamic import — matches document-indexer / pandoc / audit-parser
  // patterns and keeps mammoth out of the bundle's static graph.
  const mammoth = (await import("mammoth")).default;
  const { value: html } = await mammoth.convertToHtml({ buffer });

  // Cache the conversion on the template so subsequent loads skip
  // the fetch + mammoth round-trip and so the admin's later edits
  // can persist HTML directly.
  await prisma.auditTemplate
    .update({ where: { id: instance.template.id }, data: { sourceHtml: html } })
    .catch(() => {
      /* non-fatal — the live request still returns the HTML */
    });

  return NextResponse.json({
    html,
    source: "template" as const,
    ...responseExtras,
  });
});

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const body = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const instance = await prisma.auditInstance.findUnique({
      where: { id },
      select: {
        id: true,
        serviceId: true,
        status: true,
        service: { select: { name: true } },
        template: { select: { documentMode: true, name: true } },
      },
    });
    if (!instance) throw new ApiError(404, "Audit not found");

    ensureCoordCanTouchAudit(
      session!.user.role ?? "",
      (session!.user as { serviceId?: string | null }).serviceId,
      instance.serviceId,
    );

    if (!instance.template.documentMode) {
      throw new ApiError(400, "Not a document-mode audit");
    }

    const data: Record<string, unknown> = {
      completedHtml: parsed.data.completedHtml,
    };

    if (parsed.data.complete) {
      data.status = "completed";
      data.completedAt = new Date();
      data.complianceScore = 100;
      data.auditorId = session!.user.id;
      data.auditorName = session!.user.name;
    } else if (instance.status === "scheduled" || instance.status === "overdue") {
      data.status = "in_progress";
      data.startedAt = new Date();
      data.auditorId = session!.user.id;
      data.auditorName = session!.user.name;
    }

    // On completion, run the AI flag scan synchronously so the
    // detail page shows results immediately when the user lands on
    // it. Scan failures are non-fatal — the completion still
    // persists; aiFlags just stays null.
    if (parsed.data.complete) {
      try {
        const result = await scanAuditForFlags({
          templateName: instance.template.name,
          serviceName: instance.service?.name ?? "—",
          completedHtml: parsed.data.completedHtml,
        });
        if (result) {
          data.aiFlags = result.flags;
          data.aiSummary = result.summary;
          data.aiScannedAt = new Date();
        }
      } catch (err) {
        logger.warn("audit AI scan: skipped on completion", {
          err,
          auditId: id,
        });
      }
    }

    const updated = await prisma.auditInstance.update({
      where: { id },
      data,
      select: { id: true, status: true, completedAt: true },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: parsed.data.complete ? "complete" : "save_draft",
        entityType: "AuditInstance",
        entityId: id,
        details: {
          status: updated.status,
          templateName: instance.template.name,
          documentMode: true,
        },
      },
    });

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);

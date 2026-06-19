import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { z } from "zod";
import { ensureCoordCanTouchAudit } from "../../_lib/scope";

/**
 * Document-mode audit endpoint.
 *
 *   GET — returns the HTML the staff editor should load. If the
 *         audit already has `completedHtml` saved, return that
 *         (resume an in-progress draft or view a completed audit).
 *         Otherwise fetch the template's source .docx from Blob and
 *         convert it with mammoth. The template DOCX is never
 *         modified — each instance carries its own completedHtml.
 *
 *   PATCH — save the edited HTML. Optionally complete the audit in
 *           one call (saves HTML and flips status to "completed").
 */

const patchSchema = z.object({
  completedHtml: z.string().min(1, "completedHtml is required"),
  complete: z.boolean().optional(),
});

export const GET = withApiAuth(async (req, session, context) => {
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
        },
      },
    },
  });

  if (!instance) throw new ApiError("Audit not found", 404);

  ensureCoordCanTouchAudit(
    session!.user.role ?? "",
    (session!.user as { serviceId?: string | null }).serviceId,
    instance.serviceId,
  );

  if (!instance.template.documentMode) {
    throw new ApiError(
      "This audit is not a document-mode audit. Use the questionnaire form instead.",
      400,
    );
  }

  // Saved draft / completed copy wins.
  if (instance.completedHtml) {
    return NextResponse.json({
      html: instance.completedHtml,
      source: "saved" as const,
      sourceFileName: instance.template.sourceFileName,
    });
  }

  if (!instance.template.sourceFileUrl) {
    throw new ApiError(
      "Document-mode audit has no source file. Re-upload the template document.",
      400,
    );
  }

  // Fetch the source DOCX from Blob storage and convert to HTML.
  const docRes = await fetch(instance.template.sourceFileUrl, {
    cache: "no-store",
  });
  if (!docRes.ok) {
    throw new ApiError(
      `Couldn't fetch source document (${docRes.status}). Re-upload may be required.`,
      502,
    );
  }
  const arrayBuffer = await docRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Dynamic import — matches the rest of the codebase (document-indexer,
  // pandoc, audit-parser) and avoids Next 16 bundling issues for the
  // browser-flavoured ESM build of mammoth.
  const mammoth = (await import("mammoth")).default;
  const { value: html } = await mammoth.convertToHtml({ buffer });

  return NextResponse.json({
    html,
    source: "template" as const,
    sourceFileName: instance.template.sourceFileName,
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
        template: { select: { documentMode: true, name: true } },
      },
    });
    if (!instance) throw new ApiError("Audit not found", 404);

    ensureCoordCanTouchAudit(
      session!.user.role ?? "",
      (session!.user as { serviceId?: string | null }).serviceId,
      instance.serviceId,
    );

    if (!instance.template.documentMode) {
      throw new ApiError("Not a document-mode audit", 400);
    }

    const data: Record<string, unknown> = {
      completedHtml: parsed.data.completedHtml,
    };

    if (parsed.data.complete) {
      data.status = "completed";
      data.completedAt = new Date();
      // Doc-mode audits don't have per-item scoring, but the schema
      // requires a score field for the dashboard's avg calculation.
      // 100 = "done" — a binary signal. The audit body itself carries
      // the substance.
      data.complianceScore = 100;
      data.auditorId = session!.user.id;
      data.auditorName = session!.user.name;
    } else if (instance.status === "scheduled" || instance.status === "overdue") {
      // First save on a not-yet-started audit moves it to in_progress
      // so dashboards show it as actively being worked.
      data.status = "in_progress";
      data.startedAt = new Date();
      data.auditorId = session!.user.id;
      data.auditorName = session!.user.name;
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

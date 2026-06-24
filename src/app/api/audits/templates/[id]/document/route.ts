import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

export const runtime = "nodejs";

/**
 * Template-level inline preview + edit for document-mode audits.
 *
 *   GET — returns the master template's rendered HTML so the admin
 *         can preview / inline-edit it. Uses the cached
 *         `template.sourceHtml`, lazy-converting + caching from the
 *         source .docx on first call.
 *
 *   PATCH — admin saves an edited master template HTML. Becomes
 *         the starting content for every future scheduled instance.
 *         Existing in-flight + completed instances keep their own
 *         per-instance HTML — only fresh instances pick up the
 *         new master.
 *
 * Owner / head_office / admin only — staff edit per-instance copies
 * via /api/audits/[id]/document, not the master template.
 */

const patchSchema = z.object({
  sourceHtml: z.string().min(1, "sourceHtml is required"),
});

export const GET = withApiAuth(async (_req, _session, context) => {
  const { id } = await context!.params!;

  const template = await prisma.auditTemplate.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      documentMode: true,
      sourceFileUrl: true,
      sourceFileName: true,
      sourceHtml: true,
    },
  });

  if (!template) throw new ApiError(404, "Template not found");
  if (!template.documentMode) {
    throw new ApiError(
      400,
      "Template is not document-mode — has structured checklist items instead.",
    );
  }

  if (template.sourceHtml) {
    return NextResponse.json({
      html: template.sourceHtml,
      source: "cached" as const,
      sourceFileName: template.sourceFileName,
    });
  }

  if (!template.sourceFileUrl) {
    throw new ApiError(
      400,
      "Template has no source file. Re-upload the .docx.",
    );
  }

  const docRes = await fetch(template.sourceFileUrl, { cache: "no-store" });
  if (!docRes.ok) {
    throw new ApiError(
      502,
      `Couldn't fetch source document (${docRes.status}).`,
    );
  }
  const arrayBuffer = await docRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mammoth = (await import("mammoth")).default;
  const { value: html } = await mammoth.convertToHtml({ buffer });

  await prisma.auditTemplate
    .update({ where: { id }, data: { sourceHtml: html } })
    .catch(() => {
      /* non-fatal */
    });

  return NextResponse.json({
    html,
    source: "converted" as const,
    sourceFileName: template.sourceFileName,
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

    const template = await prisma.auditTemplate.findUnique({
      where: { id },
      select: { id: true, documentMode: true, name: true },
    });
    if (!template) throw new ApiError(404, "Template not found");
    if (!template.documentMode) {
      throw new ApiError(400, "Not a document-mode template");
    }

    await prisma.auditTemplate.update({
      where: { id },
      data: { sourceHtml: parsed.data.sourceHtml },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "update_source",
        entityType: "AuditTemplate",
        entityId: id,
        details: { name: template.name },
      },
    });

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "head_office", "admin"] },
);

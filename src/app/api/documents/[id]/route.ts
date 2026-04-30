import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { indexDocument } from "@/lib/document-indexer";

import { parseJsonBody } from "@/lib/api-error";
const updateDocumentSchema = z.object({
  folderId: z.string().nullable().optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  centreId: z.string().nullable().optional(),
  allServices: z.boolean().optional(),
  fileUrl: z.string().url().optional(),
});

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = updateDocumentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { centreId, allServices, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (allServices !== undefined) {
    updateData.allServices = allServices;
  }
  // When allServices is set to true, clear centreId (org-wide visibility supersedes centre scope)
  const effectiveCentreId = allServices === true ? null : centreId;
  if (effectiveCentreId !== undefined) {
    updateData.centre = effectiveCentreId ? { connect: { id: effectiveCentreId } } : { disconnect: true };
  }

  const document = await prisma.document.update({
    where: { id },
    data: updateData,
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
      centre: { select: { id: true, name: true, code: true } },
      folder: { select: { id: true, name: true } },
    },
  });

  if (parsed.data.fileUrl) {
    indexDocument(document.id).catch((err) => {
      logger.warn("Re-index after file update failed", { documentId: document.id, error: err });
    });
  }

  return NextResponse.json(document);
}, { roles: ["owner", "head_office", "admin"] });

export const DELETE = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  await prisma.document.update({
    where: { id },
    data: { deleted: true },
  });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin"] });

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import type { PolicyDocumentCategory } from "@prisma/client";

const POLICY_CATEGORIES = ["policy", "procedure", "other"] as const;
const ADMIN_ROLES = ["owner", "head_office", "admin"] as const;

const updatePolicySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  category: z.enum(POLICY_CATEGORIES).optional(),
});

// GET /api/policies/[id] — single document with full version history and
// acknowledgement stats for the current version. Available to any signed-in
// user. The blob URL is never exposed; only versionNumber + fileName + size.
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const doc = await prisma.policyDocument.findUnique({
    where: { id },
    include: {
      currentVersion: {
        select: {
          id: true,
          versionNumber: true,
          fileName: true,
          fileSize: true,
          uploadedAt: true,
          uploadedBy: { select: { id: true, name: true } },
        },
      },
      versions: {
        select: {
          id: true,
          versionNumber: true,
          fileName: true,
          fileSize: true,
          uploadedAt: true,
          uploadedBy: { select: { id: true, name: true } },
        },
        orderBy: { versionNumber: "desc" },
      },
    },
  });

  if (!doc) throw ApiError.notFound("Policy not found");

  // Has the caller acknowledged the current version?
  let myAcknowledgedAt: Date | null = null;
  if (doc.currentVersionId) {
    const ack = await prisma.policyDocumentAcknowledgement.findUnique({
      where: {
        versionId_userId: {
          versionId: doc.currentVersionId,
          userId: session.user.id,
        },
      },
      select: { acknowledgedAt: true },
    });
    myAcknowledgedAt = ack?.acknowledgedAt ?? null;
  }

  return NextResponse.json({
    ...doc,
    myAcknowledgedAt,
  });
});

// PATCH /api/policies/[id] — update title/description/category only.
// Uploading a new PDF is a separate route (/[id]/versions); editing metadata
// does NOT bump the version or invalidate existing acknowledgements.
export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;

    const existing = await prisma.policyDocument.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!existing) throw ApiError.notFound("Policy not found");

    const body = await parseJsonBody(req);
    const parsed = updatePolicySchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }

    const data: {
      title?: string;
      description?: string | null;
      category?: PolicyDocumentCategory;
    } = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.description !== undefined) data.description = parsed.data.description;
    if (parsed.data.category !== undefined) data.category = parsed.data.category;

    if (Object.keys(data).length === 0) {
      throw ApiError.badRequest("No fields to update");
    }

    if (data.title && data.title !== existing.title) {
      const titleClash = await prisma.policyDocument.findUnique({
        where: { title: data.title },
        select: { id: true },
      });
      if (titleClash && titleClash.id !== id) {
        throw ApiError.conflict("A policy with that title already exists");
      }
    }

    const updated = await prisma.policyDocument.update({
      where: { id },
      data,
    });

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "update",
        entityType: "PolicyDocument",
        entityId: id,
        details: { fields: Object.keys(data) },
      },
    });

    return NextResponse.json(updated);
  },
  { roles: [...ADMIN_ROLES] },
);

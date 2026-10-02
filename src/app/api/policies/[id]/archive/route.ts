import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { syncAfterResponse } from "@/lib/knowledge/hooks";
import { syncPolicyVersion, excludePolicySources } from "@/lib/knowledge/adapters/policy-upload";


const archiveSchema = z.object({
  isArchived: z.boolean().default(true),
});

// PATCH /api/policies/[id]/archive — soft delete (or unarchive).
// Default action archives. Body `{ isArchived: false }` brings it back.
export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;

    const existing = await prisma.policyDocument.findUnique({
      where: { id },
      select: { id: true, title: true, isArchived: true, currentVersionId: true },
    });
    if (!existing) throw ApiError.notFound("Policy not found");

    const body = await parseJsonBody(req).catch(() => ({}));
    const parsed = archiveSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }

    if (existing.isArchived === parsed.data.isArchived) {
      return NextResponse.json({ ok: true, isArchived: existing.isArchived });
    }

    const updated = await prisma.policyDocument.update({
      where: { id },
      data: { isArchived: parsed.data.isArchived },
      select: { id: true, isArchived: true, title: true },
    });

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: parsed.data.isArchived ? "archive" : "unarchive",
        entityType: "PolicyDocument",
        entityId: id,
        details: { title: updated.title },
      },
    });

    if (parsed.data.isArchived) {
      syncAfterResponse("policy_upload", () => excludePolicySources(id));
    } else {
      const vid = existing.currentVersionId;
      if (vid) syncAfterResponse("policy_upload", () => syncPolicyVersion(vid));
    }

    return NextResponse.json(updated);
  },
  { roles: [...ADMIN_ROLES] },
);

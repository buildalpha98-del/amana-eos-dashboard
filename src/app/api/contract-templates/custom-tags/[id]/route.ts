import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

// DELETE /api/contract-templates/custom-tags/[id]
//
// Removes a custom tag from the panel catalog. Important: this does
// NOT touch any merge-tag chips already embedded inside template
// document JSON — those continue to render with the same `{{key}}`
// fallback. Removing the catalog entry just hides it from the
// add/insert panel going forward.
export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;

    const tag = await prisma.contractCustomTag.findUnique({
      where: { id },
      select: { id: true, key: true, label: true },
    });
    if (!tag) {
      throw ApiError.notFound("Custom tag not found");
    }

    await prisma.contractCustomTag.delete({ where: { id } });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "delete",
        entityType: "ContractCustomTag",
        entityId: tag.id,
        details: { key: tag.key, label: tag.label },
      },
    });

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "admin"], feature: "contracts.create" },
);

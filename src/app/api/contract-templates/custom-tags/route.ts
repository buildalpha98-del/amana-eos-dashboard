import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { toCustomTagKey } from "@/lib/contract-templates/custom-tag-key";

const createSchema = z.object({
  // Free-form label entered by the user; we'll slugify it server-side.
  // Cap at 60 chars — the merge-tag panel uses a single-line button and
  // anything longer just gets truncated visually anyway.
  label: z.string().min(1, "Tag name is required").max(60, "Tag name is too long"),
});

// GET /api/contract-templates/custom-tags — list all org-level custom tags
export const GET = withApiAuth(
  async () => {
    const tags = await prisma.contractCustomTag.findMany({
      orderBy: { label: "asc" },
      select: {
        id: true,
        key: true,
        label: true,
        createdAt: true,
      },
    });
    return NextResponse.json(tags);
  },
  { roles: ["owner", "admin"], feature: "contracts.view" },
);

// POST /api/contract-templates/custom-tags — create a new tag
export const POST = withApiAuth(
  async (req, session) => {
    const body = await parseJsonBody(req);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }

    const label = parsed.data.label.trim();
    const key = toCustomTagKey(label);
    if (!key) {
      throw ApiError.badRequest(
        "Tag name must contain at least one letter or number",
      );
    }

    // Surface duplicates as a friendly 409 instead of a Prisma P2002.
    const existing = await prisma.contractCustomTag.findUnique({
      where: { key },
      select: { id: true, label: true },
    });
    if (existing) {
      throw ApiError.conflict(
        `Tag "${existing.label}" already exists (key: ${key})`,
      );
    }

    const tag = await prisma.contractCustomTag.create({
      data: {
        key,
        label,
        createdById: session!.user.id,
      },
      select: {
        id: true,
        key: true,
        label: true,
        createdAt: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "create",
        entityType: "ContractCustomTag",
        entityId: tag.id,
        details: { key: tag.key, label: tag.label },
      },
    });

    return NextResponse.json(tag, { status: 201 });
  },
  { roles: ["owner", "admin"], feature: "contracts.create" },
);

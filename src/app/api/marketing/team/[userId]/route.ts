import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { ContentTeamRole, ContentTeamStatus } from "@prisma/client";

const patchSchema = z.object({
  contentTeamRole: z.nativeEnum(ContentTeamRole).nullable().optional(),
  contentTeamStatus: z.nativeEnum(ContentTeamStatus).nullable().optional(),
  contentTeamStartedAt: z.string().refine((d) => !Number.isNaN(Date.parse(d)), { message: "Invalid date" }).nullable().optional(),
  contentTeamPausedAt: z.string().refine((d) => !Number.isNaN(Date.parse(d)), { message: "Invalid date" }).nullable().optional(),
  contentTeamPauseReason: z.string().max(500).nullable().optional(),
});

export const PATCH = withApiAuth(
  async (req, _session, context) => {
    const params = await context?.params;
    const userId = params?.userId;
    if (!userId) throw ApiError.badRequest("userId required");

    const raw = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, contentTeamRole: true },
    });
    if (!target) throw ApiError.notFound("User not found");

    // If status is being set to a non-null value, role must also be set (existing or in this request).
    if (parsed.data.contentTeamStatus && parsed.data.contentTeamStatus !== null) {
      const effectiveRole = parsed.data.contentTeamRole ?? target.contentTeamRole;
      if (!effectiveRole) {
        throw ApiError.badRequest("contentTeamRole is required when setting contentTeamStatus");
      }
    }

    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v === undefined) continue;
      if (k === "contentTeamStartedAt" || k === "contentTeamPausedAt") {
        data[k] = v ? new Date(v as string) : null;
      } else {
        data[k] = v;
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        contentTeamRole: true,
        contentTeamStatus: true,
        contentTeamStartedAt: true,
        contentTeamPausedAt: true,
        contentTeamPauseReason: true,
      },
    });

    return NextResponse.json({
      id: updated.id,
      contentTeamRole: updated.contentTeamRole,
      contentTeamStatus: updated.contentTeamStatus,
      contentTeamStartedAt: updated.contentTeamStartedAt?.toISOString() ?? null,
      contentTeamPausedAt: updated.contentTeamPausedAt?.toISOString() ?? null,
      contentTeamPauseReason: updated.contentTeamPauseReason,
    });
  },
  { roles: ["marketing", "owner"] },
);

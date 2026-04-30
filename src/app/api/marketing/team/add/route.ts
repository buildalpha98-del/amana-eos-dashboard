import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { ContentTeamRole, ContentTeamStatus } from "@prisma/client";

const bodySchema = z.object({
  userId: z.string().min(1),
  role: z.nativeEnum(ContentTeamRole),
  startedAt: z.string().refine((d) => !Number.isNaN(Date.parse(d)), { message: "Invalid startedAt" }).optional(),
  initialStatus: z.nativeEnum(ContentTeamStatus).optional(),
});

const ALLOWED_INITIAL: ContentTeamStatus[] = [
  ContentTeamStatus.prospect,
  ContentTeamStatus.interview,
  ContentTeamStatus.hired,
  ContentTeamStatus.onboarding,
  ContentTeamStatus.active,
];

export const POST = withApiAuth(
  async (req) => {
    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const initial = parsed.data.initialStatus ?? ContentTeamStatus.onboarding;
    if (!ALLOWED_INITIAL.includes(initial)) {
      throw ApiError.badRequest("initialStatus must be a non-departed/non-paused state");
    }

    const user = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, contentTeamRole: true, contentTeamStatus: true },
    });
    if (!user) throw ApiError.notFound("User not found");
    if (user.contentTeamRole && user.contentTeamStatus && user.contentTeamStatus !== "departed") {
      throw ApiError.conflict("User is already on the content team");
    }

    const startedAt = parsed.data.startedAt ? new Date(parsed.data.startedAt) : new Date();

    const updated = await prisma.user.update({
      where: { id: parsed.data.userId },
      data: {
        contentTeamRole: parsed.data.role,
        contentTeamStatus: initial,
        contentTeamStartedAt: startedAt,
        contentTeamPausedAt: null,
        contentTeamPauseReason: null,
      },
      select: {
        id: true,
        name: true,
        contentTeamRole: true,
        contentTeamStatus: true,
        contentTeamStartedAt: true,
      },
    });

    return NextResponse.json(
      {
        id: updated.id,
        name: updated.name,
        contentTeamRole: updated.contentTeamRole,
        contentTeamStatus: updated.contentTeamStatus,
        contentTeamStartedAt: updated.contentTeamStartedAt?.toISOString() ?? null,
      },
      { status: 201 },
    );
  },
  { roles: ["marketing", "owner"] },
);

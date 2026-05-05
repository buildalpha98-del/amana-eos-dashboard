import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { ContentTeamRole, ContentTeamStatus } from "@prisma/client";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.nativeEnum(ContentTeamRole).optional(),
  status: z.nativeEnum(ContentTeamStatus).optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  startedAt: z.string().nullable().optional(),
  pausedAt: z.string().nullable().optional(),
  pauseReason: z.string().max(500).nullable().optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export const PATCH = withApiAuth(
  async (req, _session, ctx) => {
    const { id } = await (ctx as RouteCtx).params;
    const existing = await prisma.contentTeamMember.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("Member not found");

    const raw = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const d = parsed.data;
    const updated = await prisma.contentTeamMember.update({
      where: { id },
      data: {
        ...(d.name !== undefined && { name: d.name }),
        ...(d.role !== undefined && { role: d.role }),
        ...(d.status !== undefined && { status: d.status }),
        ...(d.phone !== undefined && { phone: d.phone }),
        ...(d.email !== undefined && { email: d.email }),
        ...(d.notes !== undefined && { notes: d.notes }),
        ...(d.startedAt !== undefined && { startedAt: d.startedAt ? new Date(d.startedAt) : null }),
        ...(d.pausedAt !== undefined && { pausedAt: d.pausedAt ? new Date(d.pausedAt) : null }),
        ...(d.pauseReason !== undefined && { pauseReason: d.pauseReason }),
      },
    });

    return NextResponse.json(updated);
  },
  { roles: ["marketing", "owner"] },
);

export const DELETE = withApiAuth(
  async (_req, _session, ctx) => {
    const { id } = await (ctx as RouteCtx).params;
    const existing = await prisma.contentTeamMember.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("Member not found");

    await prisma.contentTeamMember.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  },
  { roles: ["marketing", "owner"] },
);

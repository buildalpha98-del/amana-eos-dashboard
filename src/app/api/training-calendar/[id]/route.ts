/**
 * PATCH/DELETE a single training-calendar slot (admin).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";

const patchSchema = z.object({ active: z.boolean() });

export const PATCH = withApiAuth(
  async (req, _session, context) => {
    const { id } = await context!.params!;
    const body = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid input", parsed.error.flatten());
    }
    const slot = await prisma.trainingCalendarSlot.update({
      where: { id },
      data: { active: parsed.data.active },
    });
    return NextResponse.json(slot);
  },
  { roles: [...ADMIN_ROLES] },
);

export const DELETE = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await context!.params!;
    await prisma.trainingCalendarSlot.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  },
  { roles: [...ADMIN_ROLES] },
);

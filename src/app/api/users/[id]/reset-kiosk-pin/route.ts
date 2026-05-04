/**
 * POST /api/users/[id]/reset-kiosk-pin
 *
 * Admin-triggered PIN reset. Clears the user's `kioskPinHash` so they
 * have to set a new one before they can use the kiosk again.
 *
 * Audit-logged via `ActivityLog` so there's a record of who reset
 * whose PIN and when. We do NOT log the new PIN (we don't know it —
 * we only just nulled the hash).
 *
 * 2026-05-04: timeclock v1, sub-PR 3.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import type { Role } from "@prisma/client";

const ADMIN_ROLES: Role[] = ["owner", "head_office", "admin"];

type RouteCtx = { params: Promise<{ id: string }> };

export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = await (context as unknown as RouteCtx).params;
    if (!id) throw ApiError.badRequest("Missing user id");

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!target) throw ApiError.notFound("User not found");

    await prisma.user.update({
      where: { id },
      data: { kioskPinHash: null, kioskPinSetAt: null },
    });

    // Audit trail — admin can prove "we reset Alice's PIN at 14:32 on
    // request from her" if a question comes up later.
    await prisma.activityLog
      .create({
        data: {
          userId: session.user.id,
          action: "reset_kiosk_pin",
          entityType: "User",
          entityId: id,
          details: { targetName: target.name },
        },
      })
      .catch(() => {
        /* swallow — log failure shouldn't fail the reset */
      });

    return NextResponse.json({ ok: true });
  },
  { roles: ADMIN_ROLES },
);

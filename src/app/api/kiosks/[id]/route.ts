/**
 * DELETE /api/kiosks/[id] — revoke a kiosk.
 *
 * Soft-revoke (sets `revokedAt`) so the row stays for audit. The
 * `authenticateKiosk` helper rejects any request whose token matches
 * a row with `revokedAt IS NOT NULL`.
 *
 * Idempotent: revoking an already-revoked kiosk returns 200 with the
 * existing `revokedAt`. Some admin UIs send delete twice on a
 * misclick + retry — we don't want a 404 in that case.
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

export const DELETE = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await (context as unknown as RouteCtx).params;
    if (!id) throw ApiError.badRequest("Missing kiosk id");

    const existing = await prisma.kiosk.findUnique({
      where: { id },
      select: { id: true, revokedAt: true },
    });
    if (!existing) throw ApiError.notFound("Kiosk not found");

    if (existing.revokedAt) {
      return NextResponse.json({ ok: true, revokedAt: existing.revokedAt });
    }

    const updated = await prisma.kiosk.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: { id: true, revokedAt: true },
    });
    return NextResponse.json({ ok: true, revokedAt: updated.revokedAt });
  },
  { roles: ADMIN_ROLES },
);

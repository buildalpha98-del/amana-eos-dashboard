/**
 * Admin endpoints for managing time-clock kiosks.
 *
 * - `POST /api/kiosks` — register a new kiosk; returns the bearer
 *   token in plaintext **once** so the admin can paste it into the
 *   tablet (typically via QR). The token is bcrypt-hashed before it
 *   hits the database; the plaintext is never re-readable. If the
 *   admin loses it, they revoke and register again.
 *
 * - `GET /api/kiosks` — list (optionally filtered by `?serviceId=`).
 *   Returns row metadata only — no token info.
 *
 * 2026-05-04: timeclock v1, sub-PR 3. Spec at PR #57.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { z } from "zod";
import type { Role } from "@prisma/client";

const ADMIN_ROLES: Role[] = ["owner", "head_office", "admin"];

const createKioskSchema = z.object({
  serviceId: z.string().min(1),
  label: z.string().min(1).max(100),
});

export const POST = withApiAuth(
  async (req, session) => {
    const body = await parseJsonBody(req);
    const parsed = createKioskSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid input", parsed.error.flatten());
    }

    // Verify the target service exists. Rejects typos before we
    // generate a token the admin can never recover.
    const service = await prisma.service.findUnique({
      where: { id: parsed.data.serviceId },
      select: { id: true },
    });
    if (!service) throw ApiError.notFound("Service not found");

    // 32 random bytes → 64-char hex. Plenty of entropy for a
    // long-lived bearer; printable + QR-friendly.
    const token = randomBytes(32).toString("hex");
    const tokenHash = await hash(token, 10);

    const kiosk = await prisma.kiosk.create({
      data: {
        serviceId: parsed.data.serviceId,
        label: parsed.data.label,
        tokenHash,
        createdById: session.user.id,
      },
      select: {
        id: true,
        serviceId: true,
        label: true,
        revokedAt: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        kiosk,
        // Plaintext token returned exactly once; admin must store it
        // (paste into the tablet, save QR, etc.) before navigating
        // away. We do not allow re-reads.
        token,
      },
      { status: 201 },
    );
  },
  { roles: ADMIN_ROLES },
);

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const serviceId = searchParams.get("serviceId");
    const kiosks = await prisma.kiosk.findMany({
      where: serviceId ? { serviceId } : {},
      select: {
        id: true,
        serviceId: true,
        label: true,
        revokedAt: true,
        lastSeenAt: true,
        createdAt: true,
        service: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ kiosks });
  },
  { roles: ADMIN_ROLES },
);

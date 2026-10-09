/**
 * POST /api/services/[id]/door-ipad — make THIS iPad the centre's door
 * iPad (Round 4, 2026-10-09). The centre's Coordinator or centre login
 * does it from the Today screen on the iPad itself, so there's no token to
 * copy across devices: the plaintext comes back once and the browser keeps
 * it (the same `amana.kiosk.token` slot the staff clock-in kiosk reads, so
 * the door iPad is also the clock-in kiosk).
 *
 * It's an ordinary Kiosk row: office sees every door iPad in Settings →
 * Kiosks and can revoke a lost one.
 */
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";

export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;
    const role = session.user.role;
    const ownCentre = role === "member" && session.user.serviceId === id;
    if (!isAdminRole(role) && !ownCentre) {
      throw ApiError.forbidden("Only this centre's Coordinator or the office can set up its door iPad.");
    }
    const service = await prisma.service.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!service) throw ApiError.notFound("Centre not found");

    const token = randomBytes(32).toString("hex");
    const kiosk = await prisma.kiosk.create({
      data: {
        serviceId: id,
        label: `${service.name} door iPad`,
        tokenHash: await hash(token, 10),
        createdById: session.user.id,
      },
      select: { id: true, label: true },
    });
    return NextResponse.json({ kiosk, token, serviceId: id }, { status: 201 });
  },
  { rateLimit: { max: 5, windowMs: 60_000 } },
);

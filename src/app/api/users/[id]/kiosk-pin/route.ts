/**
 * POST /api/users/[id]/kiosk-pin — the centre sets a staff member's
 * clock-in PIN at the desk (2026-10-09, Manage staff). Same rules as
 * setting your own (4 digits, no obvious runs); stored hashed, never
 * returned or logged. Staff can change it themselves on their Profile.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertManagesStaffMember, TRIVIAL_PINS } from "@/lib/centre-staff-access";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits") });

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as Ctx).params;
    await assertManagesStaffMember(session, id);
    const parsed = schema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Invalid PIN");
    if (TRIVIAL_PINS.has(parsed.data.pin)) {
      throw ApiError.badRequest("Pick a less obvious PIN — a 4-digit run or all-same isn't allowed.");
    }
    await prisma.user.update({
      where: { id },
      data: { kioskPinHash: await hash(parsed.data.pin, 10), kioskPinSetAt: new Date() },
    });
    await prisma.activityLog
      .create({ data: { userId: session.user.id, action: "set_kiosk_pin", entityType: "User", entityId: id, details: {} } })
      .catch(() => {});
    return NextResponse.json({ ok: true });
  },
  { rateLimit: { max: 20, windowMs: 60_000 } },
);

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";
import {
  ensureRefCodesForPilot,
  signupUrlForCode,
} from "@/lib/ambassadors/ref-codes";
import { buildScanUrl } from "@/lib/activation-qr";

/**
 * GET   /api/ambassadors/ref-codes — list codes (role-scoped):
 *       staff → their own; member/head_office → their centres' educators;
 *       admin/owner → all. Includes the signup URL, the /a/ scan URL the
 *       printed QR must encode, and scan counts.
 * POST  /api/ambassadors/ref-codes — generate for the active pilot's staff.
 * PATCH /api/ambassadors/ref-codes — { userId, active } toggle.
 */

export const GET = withApiAuth(
  async (req, session) => {
    const role = session.user.role as string;
    const userId = session.user.id as string;

    let userFilter: Record<string, unknown>;
    if (role === "staff") {
      userFilter = { id: userId };
    } else {
      const { serviceIds } = await getCentreScope(session);
      userFilter =
        serviceIds === null
          ? {}
          : {
              OR: [
                { serviceId: { in: serviceIds } },
                {
                  serviceMemberships: {
                    some: { serviceId: { in: serviceIds }, status: "active" },
                  },
                },
              ],
            };
    }

    const codes = await prisma.educatorRefCode.findMany({
      where: { user: { ...userFilter, active: true } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        code: true,
        active: true,
        user: {
          select: {
            id: true,
            name: true,
            role: true,
            service: { select: { name: true, code: true } },
          },
        },
        qrCode: {
          select: { shortCode: true, _count: { select: { scans: true } } },
        },
      },
    });

    return NextResponse.json({
      codes: codes.map((c) => ({
        id: c.id,
        code: c.code,
        active: c.active,
        user: c.user,
        signupUrl: signupUrlForCode(c.code),
        // The URL the printed QR encodes — goes through /a/{shortCode} so
        // scans are counted, then redirects to the signup URL.
        qrUrl: c.qrCode ? buildScanUrl(c.qrCode.shortCode) : signupUrlForCode(c.code),
        scanCount: c.qrCode?._count.scans ?? 0,
      })),
    });
  },
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);

export const POST = withApiAuth(
  async (req, session) => {
    const pilot = await prisma.ambassadorPilot.findFirst({
      where: { status: { in: ["draft", "active"] } },
      orderBy: { startDate: "desc" },
      select: { id: true },
    });
    if (!pilot) throw ApiError.notFound("No open Ambassadors pilot exists");

    const result = await ensureRefCodesForPilot(pilot.id);
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "ambassador_ref_codes_generated",
        entityType: "AmbassadorPilot",
        entityId: pilot.id,
        details: result,
      },
    });
    return NextResponse.json(result);
  },
  { roles: ["owner", "head_office", "admin"] },
);

const patchSchema = z.object({
  userId: z.string().min(1),
  active: z.boolean(),
});

export const PATCH = withApiAuth(
  async (req, session) => {
    const parsed = patchSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const updated = await prisma.educatorRefCode.updateMany({
      where: { userId: parsed.data.userId },
      data: { active: parsed.data.active },
    });
    if (updated.count === 0) throw ApiError.notFound("No ref code for that user");
    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "ambassador_ref_code_toggled",
        entityType: "EducatorRefCode",
        entityId: parsed.data.userId,
        details: { active: parsed.data.active },
      },
    });
    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "head_office", "admin"] },
);

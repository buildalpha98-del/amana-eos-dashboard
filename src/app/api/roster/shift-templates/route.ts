/**
 * GET  /api/roster/shift-templates?serviceId=xxx — list templates for a service
 * POST /api/roster/shift-templates — create a new template
 *
 * Connecteam-style saved shift patterns. The original use case from
 * Daniel: every Mon-Fri he was creating five identical "ASC educator
 * 3-6pm" rows by hand. Templates let him save the pattern once and
 * pick it from a dropdown when adding a shift.
 *
 * Auth model mirrors `POST /api/roster/shifts`:
 * - Org-wide roles (owner/head_office/admin) — any service.
 * - `member` (Director of Service) — only their own assigned service.
 * - Everyone else — 403.
 *
 * 2026-05-04: introduced as the smallest piece of the larger
 * drag-to-create + templates spec. Templates ship now; drag-from-
 * template-onto-grid is a follow-up.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { z } from "zod";

function callerCanManage(
  role: string,
  callerServiceId: string | null,
  serviceId: string,
): boolean {
  if (isAdminRole(role)) return true;
  if (role === "member" && callerServiceId === serviceId) return true;
  return false;
}

// ── GET ───────────────────────────────────────────────────────────────

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  if (!serviceId) throw ApiError.badRequest("serviceId required");

  const role = session.user.role ?? "";
  const callerServiceId =
    (session.user as { serviceId?: string | null }).serviceId ?? null;

  // Read access: admins anywhere; member/staff only at their own
  // assigned service. (Read access is wider than write so staff
  // educators see the same picker if/when a self-service flow lands.)
  if (!isAdminRole(role) && callerServiceId !== serviceId) {
    throw ApiError.forbidden();
  }

  const templates = await prisma.shiftTemplate.findMany({
    where: { serviceId },
    orderBy: [{ sessionType: "asc" }, { shiftStart: "asc" }, { label: "asc" }],
  });
  return NextResponse.json({ templates });
});

// ── POST ──────────────────────────────────────────────────────────────

const createSchema = z.object({
  serviceId: z.string().min(1),
  label: z.string().trim().min(1).max(60),
  sessionType: z.enum(["bsc", "asc", "vc"]),
  shiftStart: z.string().regex(/^\d{2}:\d{2}$/),
  shiftEnd: z.string().regex(/^\d{2}:\d{2}$/),
  role: z.string().trim().max(40).nullish(),
});

export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  }
  const data = parsed.data;
  if (data.shiftStart >= data.shiftEnd) {
    throw ApiError.badRequest("shiftEnd must be later than shiftStart");
  }

  const role = session.user.role ?? "";
  const callerServiceId =
    (session.user as { serviceId?: string | null }).serviceId ?? null;
  if (!callerCanManage(role, callerServiceId, data.serviceId)) {
    throw ApiError.forbidden();
  }

  // Soft uniqueness — DB has @@unique([serviceId, label]) so a duplicate
  // label at the same service surfaces as a P2002. Translate to a
  // friendly 409.
  try {
    const template = await prisma.shiftTemplate.create({
      data: {
        serviceId: data.serviceId,
        label: data.label,
        sessionType: data.sessionType,
        shiftStart: data.shiftStart,
        shiftEnd: data.shiftEnd,
        role: data.role ?? null,
        createdById: session.user.id,
      },
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      throw ApiError.conflict(
        `A template named "${data.label}" already exists at this service.`,
      );
    }
    throw err;
  }
});

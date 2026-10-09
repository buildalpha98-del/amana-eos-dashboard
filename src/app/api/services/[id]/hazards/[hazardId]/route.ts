/**
 * PATCH /api/services/[id]/hazards/[hazardId] — the Coordinator (or the
 * office) sets priority, who's fixing it, the due date and status, and
 * closes it off with a note. Educators report; they don't triage.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";

type Ctx = { params: Promise<{ id: string; hazardId: string }> };

const patchSchema = z.object({
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["open", "in_progress", "waiting", "fixed"]).optional(),
  assignedTo: z.string().trim().max(80).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  fixNotes: z.string().trim().max(2000).nullable().optional(),
});

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id, hazardId } = await (context as unknown as Ctx).params;
  const role = session.user.role ?? "";
  if (!isAdminRole(role) && !(role === "member" && session.user.serviceId === id)) {
    throw ApiError.forbidden("Your Coordinator looks after hazards once they're reported.");
  }
  const existing = await prisma.hazardReport.findUnique({ where: { id: hazardId }, select: { serviceId: true, status: true } });
  if (!existing || existing.serviceId !== id) throw ApiError.notFound("Hazard not found");
  const parsed = patchSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) throw ApiError.badRequest("Invalid update");
  const d = parsed.data;
  const closing = d.status === "fixed" && existing.status !== "fixed";
  const reopening = d.status && d.status !== "fixed" && existing.status === "fixed";
  const hazard = await prisma.hazardReport.update({
    where: { id: hazardId },
    data: {
      ...(d.priority && { priority: d.priority }),
      ...(d.status && { status: d.status }),
      ...(d.assignedTo !== undefined && { assignedTo: d.assignedTo || null }),
      ...(d.dueDate !== undefined && { dueDate: d.dueDate ? new Date(`${d.dueDate}T00:00:00Z`) : null }),
      ...(d.fixNotes !== undefined && { fixNotes: d.fixNotes || null }),
      ...(closing && { fixedAt: new Date(), fixedByName: session.user.name ?? "Staff" }),
      ...(reopening && { fixedAt: null, fixedByName: null }),
    },
  });
  return NextResponse.json({ hazard });
});

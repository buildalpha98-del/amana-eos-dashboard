/**
 * PATCH/DELETE /api/services/[id]/session-times/[sessionTimeId]
 *
 * Editing one window of the centre's session-of-care catalogue.
 *
 * DELETE is a real delete, and that is safe ONLY because nothing yet
 * holds a foreign key to a session time — fees still carry their own
 * copied start/end. The moment a fee references `sessionTimeId`, this
 * must become an archive (set `active: false`) instead, or deleting a
 * window will silently unname the session of care on live fees. The
 * `active` flag already exists for exactly that reason; PATCH can retire
 * a window today without deleting it.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { describeWindowProblem } from "@/lib/session-times";
import { z } from "zod";

const patchSchema = z.object({
  start: z.string().trim().min(1).optional(),
  end: z.string().trim().min(1).optional(),
  label: z.string().trim().max(60).nullable().optional(),
  active: z.boolean().optional(),
});

function assertCanWrite(
  session: { user: { role?: string | null; serviceId?: string | null } },
  serviceId: string,
) {
  const role = session.user.role ?? "";
  if (isAdminRole(role)) return;
  if (role !== "member") throw ApiError.forbidden();
  const own = (session.user as { serviceId?: string | null }).serviceId ?? null;
  if (!own || own !== serviceId) throw ApiError.forbidden();
}

/**
 * Load the row and prove it belongs to the service in the path.
 *
 * Without the serviceId check a session time id from one centre could be
 * edited through another centre's URL, which the caller may well have
 * write access to.
 */
async function loadOwned(serviceId: string, sessionTimeId: string) {
  const row = await prisma.serviceSessionTime.findUnique({
    where: { id: sessionTimeId },
    select: { id: true, serviceId: true, start: true, end: true },
  });
  if (!row || row.serviceId !== serviceId) {
    throw ApiError.notFound("Session time not found");
  }
  return row;
}

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id, sessionTimeId } = await context!.params!;
  assertCanWrite(session, id);
  const existing = await loadOwned(id, sessionTimeId);

  const parsed = patchSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid session time", parsed.error.flatten());
  }
  const { start, end, label, active } = parsed.data;

  // Validate the window it would BECOME, not the fields that arrived —
  // a PATCH moving only the end time still has to land on a valid pair.
  if (start !== undefined || end !== undefined) {
    const problem = describeWindowProblem(
      start ?? existing.start,
      end ?? existing.end,
    );
    if (problem) throw ApiError.badRequest(problem);
  }

  try {
    const updated = await prisma.serviceSessionTime.update({
      where: { id: sessionTimeId },
      data: {
        ...(start !== undefined ? { start } : {}),
        ...(end !== undefined ? { end } : {}),
        ...(label !== undefined ? { label: label?.trim() || null } : {}),
        ...(active !== undefined ? { active } : {}),
      },
      select: {
        id: true,
        start: true,
        end: true,
        label: true,
        active: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ sessionTime: updated });
  } catch (e) {
    if (
      typeof e === "object" &&
      e !== null &&
      (e as { code?: string }).code === "P2002"
    ) {
      throw ApiError.conflict("That window is already a session time.");
    }
    throw e;
  }
});

export const DELETE = withApiAuth(async (_req, session, context) => {
  const { id, sessionTimeId } = await context!.params!;
  assertCanWrite(session, id);
  await loadOwned(id, sessionTimeId);

  await prisma.serviceSessionTime.delete({ where: { id: sessionTimeId } });
  return NextResponse.json({ ok: true });
});

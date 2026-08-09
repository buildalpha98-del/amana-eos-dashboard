/**
 * GET/POST /api/services/[id]/session-times
 *
 * The centre's session-of-care catalogue. Every fee in every room names
 * one of these windows, so this list is what keeps the same session
 * identical across rooms instead of retyped per fee.
 *
 * Read is open to the centre's own Director as well as the admin tier —
 * a coordinator building a fee matrix needs the list in front of them.
 * Write is admin tier plus the Director of this service, matching who
 * can already edit the rooms these windows are used by.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { compareSessionTimes, describeWindowProblem } from "@/lib/session-times";
import { z } from "zod";

const createSchema = z.object({
  start: z.string().trim().min(1),
  end: z.string().trim().min(1),
  label: z.string().trim().max(60).optional().nullable(),
});

/** Read: admin tier anywhere, or anyone whose own service this is. */
function assertCanRead(
  session: { user: { role?: string | null; serviceId?: string | null } },
  serviceId: string,
) {
  const role = session.user.role ?? "";
  const own = (session.user as { serviceId?: string | null }).serviceId === serviceId;
  if (!isAdminRole(role) && !own) throw ApiError.forbidden();
}

/**
 * Write: admin tier anywhere, or the Director of Service at their own
 * centre. Same narrowing the app-settings route uses.
 */
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

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  assertCanRead(session, id);

  const rows = await prisma.serviceSessionTime.findMany({
    where: { serviceId: id },
    select: {
      id: true,
      start: true,
      end: true,
      label: true,
      active: true,
      createdAt: true,
    },
  });

  // Sorted in code rather than SQL: "HH:mm" sorts correctly as text only
  // because it's zero-padded, and relying on that silently breaks the
  // day someone stores "9:00". compareSessionTimes parses instead.
  return NextResponse.json({ sessionTimes: rows.sort(compareSessionTimes) });
});

export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  assertCanWrite(session, id);

  const parsed = createSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid session time", parsed.error.flatten());
  }
  const { start, end, label } = parsed.data;

  // One validator, shared with the form, so the message under the field
  // and the message in the 400 are the same sentence.
  const problem = describeWindowProblem(start, end);
  if (problem) throw ApiError.badRequest(problem);

  const service = await prisma.service.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!service) throw ApiError.notFound("Service not found");

  try {
    const created = await prisma.serviceSessionTime.create({
      data: {
        serviceId: id,
        start,
        end,
        label: label?.trim() || null,
        createdById: session.user.id ?? null,
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
    return NextResponse.json({ sessionTime: created }, { status: 201 });
  } catch (e) {
    // The (serviceId, start, end) unique index. A duplicate window is a
    // 409 rather than a 500 — the caller did nothing wrong, the window
    // just already exists.
    if (
      typeof e === "object" &&
      e !== null &&
      (e as { code?: string }).code === "P2002"
    ) {
      throw ApiError.conflict(`${start}–${end} is already a session time.`);
    }
    throw e;
  }
});

/**
 * Staff emails (Communication → Staff emails). Office only.
 * GET  — recent updates (drafts, approved, sent) + the Cowork setting.
 * POST — new update; `{ approve: true }` approves it at once, and an urgent
 *        approved update is sent straight away.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { getOrgSettings } from "@/lib/org-settings";
import { sendUrgentUpdate } from "@/lib/staff-updates";
import { staffUpdateFieldsSchema, withContent } from "./schema";

export const maxDuration = 300;

export const GET = withApiAuth(
  async () => {
    const [updates, settings] = await Promise.all([
      prisma.staffUpdate.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      getOrgSettings(),
    ]);
    return NextResponse.json({
      updates,
      coworkAutoApprove: settings.notifications.coworkStaffEmailsAutoApprove,
    });
  },
  { roles: [...ADMIN_ROLES] },
);

export const POST = withApiAuth(
  async (req, session) => {
    const body = (await parseJsonBody(req)) as Record<string, unknown>;
    const parsed = staffUpdateFieldsSchema.safeParse(body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Check the form.");
    const approve = body.approve === true;
    const now = new Date();
    const created = await prisma.staffUpdate.create({
      data: {
        ...withContent(parsed.data),
        source: "admin",
        createdById: session.user.id,
        createdByName: session.user.name ?? null,
        ...(approve
          ? { status: "approved", approvedById: session.user.id, approvedByName: session.user.name ?? null, approvedAt: now }
          : {}),
      },
    });
    const sent = approve && created.urgent ? await sendUrgentUpdate(created.id) : null;
    return NextResponse.json({ update: created, sent }, { status: 201 });
  },
  { roles: [...ADMIN_ROLES], timeoutMs: 290_000 },
);

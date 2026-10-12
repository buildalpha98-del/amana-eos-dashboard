/**
 * PATCH a staff email: `{ action: "approve" | "cancel" | "edit", ...fields }`.
 * Only drafts and approved-but-unsent ones can change. Approving an urgent
 * one sends it straight away; others wait for the Monday round-up.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { sendUrgentUpdate } from "@/lib/staff-updates";
import { staffUpdateFieldsSchema } from "../schema";

export const maxDuration = 300;

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const body = (await parseJsonBody(req)) as Record<string, unknown>;
    const action = body.action;
    const existing = await prisma.staffUpdate.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("That staff email no longer exists.");
    if (existing.status === "sent" || existing.status === "cancelled") {
      throw ApiError.conflict(`It has already been ${existing.status}.`);
    }

    if (action === "cancel") {
      const u = await prisma.staffUpdate.update({ where: { id }, data: { status: "cancelled" } });
      return NextResponse.json({ update: u });
    }

    let fields = {};
    if (action === "edit" || action === "approve") {
      const parsed = staffUpdateFieldsSchema.partial().safeParse(body);
      if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Check the form.");
      fields = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
    } else {
      throw ApiError.badRequest("Unknown action.");
    }

    const u = await prisma.staffUpdate.update({
      where: { id },
      data: {
        ...fields,
        ...(action === "approve"
          ? { status: "approved", approvedById: session.user.id, approvedByName: session.user.name ?? null, approvedAt: new Date() }
          : {}),
      },
    });
    const sent = action === "approve" && u.urgent ? await sendUrgentUpdate(u.id) : null;
    return NextResponse.json({ update: u, sent });
  },
  { roles: [...ADMIN_ROLES], timeoutMs: 290_000 },
);

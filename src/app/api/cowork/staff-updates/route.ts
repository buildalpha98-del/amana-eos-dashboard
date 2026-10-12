/**
 * POST /api/cowork/staff-updates — Cowork pushes a staff email (policy
 * update, reminder, please read, professional development, wellbeing).
 *
 * It lands as a DRAFT in Communication → Staff emails for an admin to check
 * and approve (Daniel, 12 Oct 2026), unless "Send Cowork messages without
 * approval" is on. Approved ones go out in the Monday round-up; `urgent`
 * ones on their own as soon as they're approved.
 *
 * Body: { type, title, body, linkUrl?, linkLabel?, roles?: Role[],
 *         serviceCodes?: string[], urgent? }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork, setVersionHeaders } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { parseJsonBody } from "@/lib/api-error";
import { getOrgSettings } from "@/lib/org-settings";
import { sendUrgentUpdate } from "@/lib/staff-updates";
import { staffUpdateFieldsSchema } from "@/app/api/staff-updates/schema";

export const maxDuration = 300;

const coworkSchema = staffUpdateFieldsSchema
  .omit({ audienceRoles: true, audienceServiceIds: true })
  .extend({
    roles: staffUpdateFieldsSchema.shape.audienceRoles,
    serviceCodes: z.array(z.string().min(1)).max(50).default([]),
  });

export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const parsed = coworkSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    return setVersionHeaders(NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 }), 1);
  }
  const { roles, serviceCodes, ...fields } = parsed.data;
  let audienceServiceIds: string[] = [];
  if (serviceCodes.length) {
    const services = await prisma.service.findMany({ where: { code: { in: serviceCodes } }, select: { id: true, code: true } });
    const missing = serviceCodes.filter((c) => !services.some((s) => s.code === c));
    if (missing.length) {
      return setVersionHeaders(NextResponse.json({ error: `Unknown service code(s): ${missing.join(", ")}` }, { status: 404 }), 1);
    }
    audienceServiceIds = services.map((s) => s.id);
  }

  const autoApprove = (await getOrgSettings()).notifications.coworkStaffEmailsAutoApprove;
  const update = await prisma.staffUpdate.create({
    data: {
      ...fields,
      audienceRoles: roles,
      audienceServiceIds,
      source: "cowork",
      createdByName: "Cowork",
      ...(autoApprove ? { status: "approved", approvedByName: "Cowork (auto)", approvedAt: new Date() } : {}),
    },
  });
  const sent = autoApprove && update.urgent ? await sendUrgentUpdate(update.id) : null;
  return setVersionHeaders(NextResponse.json({ update, sent, needsApproval: !autoApprove }, { status: 201 }), 1);
}, { timeoutMs: 290_000 });

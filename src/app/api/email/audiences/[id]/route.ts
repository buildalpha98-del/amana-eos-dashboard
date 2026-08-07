import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { audienceRulesSchema } from "@/lib/audience-rules";
import {
  countAudienceRecipients,
  parseStoredAudienceRules,
} from "@/lib/audience-count";

const AUDIENCE_ROLES = ["owner", "head_office", "admin", "marketing"] as const;

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  rules: audienceRulesSchema.optional(),
});

const audienceInclude = {
  createdBy: { select: { id: true, name: true } },
} as const;

// GET /api/email/audiences/:id — audience + live post-suppression count
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const audience = await prisma.emailAudience.findUnique({
    where: { id },
    include: audienceInclude,
  });
  if (!audience) {
    return NextResponse.json({ error: "Audience not found" }, { status: 404 });
  }

  const rules = parseStoredAudienceRules(audience.rules);
  const count = await countAudienceRecipients(rules);

  return NextResponse.json({ ...audience, count });
}, { roles: [...AUDIENCE_ROLES] });

// PATCH /api/email/audiences/:id
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const existing = await prisma.emailAudience.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Audience not found" }, { status: 404 });
  }

  const body = await parseJsonBody(req);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { name, description, rules } = parsed.data;

  const audience = await prisma.emailAudience.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(rules !== undefined && { rules }),
    },
    include: audienceInclude,
  });

  return NextResponse.json(audience);
}, { roles: [...AUDIENCE_ROLES] });

// DELETE /api/email/audiences/:id — ARCHIVE, never hard-delete.
// Sends reference audiences at send time only (rules are re-resolved), but
// archiving keeps the row for audit/history and lets recipient-count 409
// instead of 404 when a stale composer still points at it.
export const DELETE = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const existing = await prisma.emailAudience.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Audience not found" }, { status: 404 });
  }

  await prisma.emailAudience.update({
    where: { id },
    data: { archived: true },
  });

  return NextResponse.json({ success: true });
}, { roles: [...AUDIENCE_ROLES] });

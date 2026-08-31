import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { audienceRulesSchema } from "@/lib/audience-rules";

const AUDIENCE_ROLES = ["owner", "head_office", "admin", "marketing"] as const;

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  rules: audienceRulesSchema,
});

const audienceInclude = {
  createdBy: { select: { id: true, name: true } },
} as const;

// GET /api/email/audiences — list non-archived audiences
export const GET = withApiAuth(async () => {
  const audiences = await prisma.emailAudience.findMany({
    where: { archived: false },
    include: audienceInclude,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(audiences);
}, { roles: [...AUDIENCE_ROLES] });

// POST /api/email/audiences — create
export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const audience = await prisma.emailAudience.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? undefined,
      rules: parsed.data.rules,
      createdById: session.user.id,
    },
    include: audienceInclude,
  });

  return NextResponse.json(audience, { status: 201 });
}, { roles: [...AUDIENCE_ROLES] });

/**
 * POST /api/roster/shifts/acknowledge — "I've seen my shifts" (2026-10-09,
 * OWNA parity). Stamps the caller's own published shifts between `from`
 * and `to` that haven't been seen yet. A shift that is later changed loses
 * its stamp (see the shift PATCH route), so it shows as new again.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const schema = z.object({ from: z.string().regex(DAY), to: z.string().regex(DAY) });

export const POST = withApiAuth(async (req, session) => {
  const parsed = schema.safeParse(await parseJsonBody(req));
  if (!parsed.success) throw ApiError.badRequest("from and to are required (YYYY-MM-DD)");
  const { count } = await prisma.rosterShift.updateMany({
    where: {
      userId: session.user.id,
      status: "published",
      acknowledgedAt: null,
      date: { gte: new Date(`${parsed.data.from}T00:00:00Z`), lte: new Date(`${parsed.data.to}T00:00:00Z`) },
    },
    data: { acknowledgedAt: new Date() },
  });
  return NextResponse.json({ acknowledged: count });
});

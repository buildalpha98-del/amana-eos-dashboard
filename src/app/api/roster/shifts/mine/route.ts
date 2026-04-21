import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { z } from "zod";

// ---------------------------------------------------------------------------
// GET /api/roster/shifts/mine?from=YYYY-MM-DD&to=YYYY-MM-DD
// Self-scoped — always returns the caller's own published shifts in the
// requested window. There is no ?userId= override; admins who need to view
// other staff's shifts use the regular /api/roster/shifts route.
// ---------------------------------------------------------------------------

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });
  if (!parsed.success) {
    throw ApiError.badRequest(
      "from and to (YYYY-MM-DD) required",
      parsed.error.flatten(),
    );
  }
  const shifts = await prisma.rosterShift.findMany({
    where: {
      userId: session.user.id,
      status: "published",
      date: {
        gte: new Date(parsed.data.from),
        lte: new Date(parsed.data.to),
      },
    },
    orderBy: [{ date: "asc" }, { shiftStart: "asc" }],
    include: { service: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ shifts });
});

/**
 * POST /api/my-portal/reading { doc: "handbook" | "amana-way" } — the
 * signed-in staff member confirms they've read it (My Portal checklist,
 * 2026-10-07). First confirmation wins; re-confirming is a no-op.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const bodySchema = z.object({ doc: z.enum(["handbook", "amana-way"]) });

export const POST = withApiAuth(async (req, session) => {
  const parsed = bodySchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) throw ApiError.badRequest("Unknown document");
  const field = parsed.data.doc === "handbook" ? "handbookReadAt" : "amanaWayReadAt";
  await prisma.user.updateMany({
    where: { id: session!.user.id, [field]: null },
    data: { [field]: new Date() },
  });
  return NextResponse.json({ ok: true });
});

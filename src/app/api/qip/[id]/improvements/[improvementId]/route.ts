import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { improvementUpdateSchema } from "@/lib/schemas/sat";
import { requireQipAccess, QIP_WRITE_ROLES } from "@/app/api/qip/_lib/access";

/**
 * PATCH /api/qip/[id]/improvements/[improvementId] — update a row.
 * DELETE /api/qip/[id]/improvements/[improvementId] — remove a row.
 */
export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id: qipId, improvementId } = await context!.params!;
    await requireQipAccess(qipId, session);

    const body = await parseJsonBody(req);
    const parsed = improvementUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const existing = await prisma.satImprovement.findFirst({
      where: { id: improvementId, qipId },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound("Improvement not found");

    const row = await prisma.satImprovement.update({
      where: { id: improvementId },
      data: parsed.data,
    });
    return NextResponse.json(row);
  },
  { roles: QIP_WRITE_ROLES },
);

export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const { id: qipId, improvementId } = await context!.params!;
    await requireQipAccess(qipId, session);

    const existing = await prisma.satImprovement.findFirst({
      where: { id: improvementId, qipId },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound("Improvement not found");

    await prisma.satImprovement.delete({ where: { id: improvementId } });
    return NextResponse.json({ ok: true });
  },
  { roles: QIP_WRITE_ROLES },
);

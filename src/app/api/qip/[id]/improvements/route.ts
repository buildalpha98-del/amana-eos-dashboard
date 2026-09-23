import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { improvementCreateSchema } from "@/lib/schemas/sat";
import { requireQipAccess, QIP_WRITE_ROLES } from "@/app/api/qip/_lib/access";

/**
 * POST /api/qip/[id]/improvements — add a Continuous Improvement Opportunities row.
 */
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id: qipId } = await context!.params!;
    await requireQipAccess(qipId, session);

    const body = await parseJsonBody(req);
    const parsed = improvementCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const row = await prisma.satImprovement.create({
      data: { qipId, ...parsed.data },
    });

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "created_sat_improvement",
        entityType: "SatImprovement",
        entityId: row.id,
        details: { qipId, elementCode: row.elementCode, priority: row.priority },
      },
    });

    return NextResponse.json(row, { status: 201 });
  },
  { roles: QIP_WRITE_ROLES },
);

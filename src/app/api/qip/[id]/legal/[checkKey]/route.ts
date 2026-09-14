import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { legalPatchSchema } from "@/lib/schemas/sat";
import { NQS_LEGAL_CHECKS } from "@/lib/nqs-taxonomy";
import { requireQipAccess, QIP_WRITE_ROLES } from "@/app/api/qip/_lib/access";

const CHECK_KEYS = new Set(NQS_LEGAL_CHECKS.map((c) => c.checkKey));

/**
 * PATCH /api/qip/[id]/legal/[checkKey]
 *
 * Upsert one Law & Regulations checklist answer
 * (compliant / non_compliant / not_applicable / not_assessed).
 */
export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id: qipId, checkKey } = await context!.params!;

    if (!CHECK_KEYS.has(checkKey)) {
      throw ApiError.badRequest(`Unknown legal check: ${checkKey}`);
    }
    await requireQipAccess(qipId, session);

    const body = await parseJsonBody(req);
    const parsed = legalPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const row = await prisma.satLegalCheck.upsert({
      where: { qipId_checkKey: { qipId, checkKey } },
      create: { qipId, checkKey, assessment: parsed.data.assessment },
      update: { assessment: parsed.data.assessment },
    });

    return NextResponse.json(row);
  },
  { roles: QIP_WRITE_ROLES },
);

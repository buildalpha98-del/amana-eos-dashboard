import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { elementPatchSchema } from "@/lib/schemas/sat";
import { ELEMENT_BY_CODE, EVIDENCE_SLOTS } from "@/lib/nqs-taxonomy";
import { requireQipAccess, QIP_WRITE_ROLES } from "@/app/api/qip/_lib/access";

/**
 * PATCH /api/qip/[id]/elements/[elementCode]
 *
 * Upsert one NQS element's assessment: up to 5 evidence entries + Met/Not Met.
 * Rows are created lazily — the taxonomy defines which elements exist.
 */
export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id: qipId, elementCode } = await context!.params!;

    if (!ELEMENT_BY_CODE.has(elementCode)) {
      throw ApiError.badRequest(`Unknown NQS element: ${elementCode}`);
    }
    await requireQipAccess(qipId, session);

    const body = await parseJsonBody(req);
    const parsed = elementPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { evidence, assessment } = parsed.data;
    // Trim trailing empty slots; interior empties are allowed (form has fixed boxes)
    const cleanedEvidence = evidence
      ?.slice(0, EVIDENCE_SLOTS)
      .map((e) => e.trim());

    const row = await prisma.satElementAssessment.upsert({
      where: { qipId_elementCode: { qipId, elementCode } },
      create: {
        qipId,
        elementCode,
        evidence: cleanedEvidence ?? [],
        assessment: assessment ?? "not_assessed",
      },
      update: {
        ...(cleanedEvidence !== undefined ? { evidence: cleanedEvidence } : {}),
        ...(assessment !== undefined ? { assessment } : {}),
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "updated_sat_element",
        entityType: "SatElementAssessment",
        entityId: row.id,
        details: { qipId, elementCode, assessment: row.assessment },
      },
    });

    return NextResponse.json(row);
  },
  { roles: QIP_WRITE_ROLES },
);

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
// .strict(): unknown fields are a 400, not silently stripped. The old UI
// submitted phantom `rating`/`goals` fields for months and the edits just
// vanished — strict mode makes that class of drift loud.
const updateQualityAreaSchema = z
  .object({
    strengths: z.string().optional(),
    areasForImprovement: z.string().optional(),
    improvementGoal: z.string().optional(),
    strategies: z.string().optional(),
    timeline: z.string().optional(),
    responsiblePerson: z.string().optional(),
    evidenceIndicators: z.string().optional(),
    evidenceCollected: z.string().optional(),
    progressNotes: z.string().optional(),
    progressStatus: z
      .enum(["not_started", "in_progress", "achieved", "ongoing"])
      .optional(),
  })
  .strict();
/**
 * PATCH /api/qip/[id]/areas/[areaId] — Update individual quality area content
 */
export const PATCH = withApiAuth(async (req, session, context) => {
  const { areaId } = await context!.params!;

  try {
    const body = await parseJsonBody(req);
    const parsed = updateQualityAreaSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    for (const [f, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue;
      data[f] = value;
    }

    const area = await prisma.qIPQualityArea.update({
      where: { id: areaId },
      data,
    });

    return NextResponse.json(area);
  } catch (err) {
    logger.error("QIP Area PATCH", { err });
    return NextResponse.json({ error: "Failed to update quality area" }, { status: 500 });
  }
}, { roles: ["owner", "head_office", "admin", "member"] });

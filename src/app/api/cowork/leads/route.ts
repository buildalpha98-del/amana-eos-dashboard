import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { logCoworkActivity } from "@/app/api/cowork/_lib/cowork-activity-log";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { parseJsonBody } from "@/lib/api-error";

const createLeadSchema = z.object({
  schoolName: z.string().min(1),
  contactName: z.string().min(1).optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  suburb: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  /** Role of the contact (e.g. Principal) — folded into notes. */
  role: z.string().max(160).optional().nullable(),
  notes: z.string().optional().nullable(),
  source: z
    .enum([
      "website",
      "direct",
      "referral",
      "tender",
      "build_alpha_kids",
      "community_connection",
    ])
    .optional(),
});

/**
 * POST /api/cowork/leads — Create a school-partnership lead via the cowork API.
 *
 * Used by the marketing site's "Book a call" / partner funnel: a school leader
 * requesting a conversation enters the Leads (partnerships) pipeline at
 * `new_lead` — separate from parent enquiries, so it is never enrolled in the
 * parent nurture sequence.
 *
 * Auth: cowork Bearer token (COWORK_API_KEY).
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await parseJsonBody(req);
    const data = createLeadSchema.parse(body);

    const notes =
      [data.notes, data.role ? `Role: ${data.role}` : null]
        .filter(Boolean)
        .join("\n") || null;

    const lead = await prisma.lead.create({
      data: {
        schoolName: data.schoolName,
        contactName: data.contactName || null,
        contactEmail: data.contactEmail || null,
        contactPhone: data.contactPhone || null,
        address: data.address || null,
        suburb: data.suburb || null,
        state: data.state || null,
        postcode: data.postcode || null,
        source: data.source ?? "website",
        pipelineStage: "new_lead",
        notes,
        stageChangedAt: new Date(),
      },
      select: {
        id: true,
        schoolName: true,
        pipelineStage: true,
        source: true,
      },
    });

    logCoworkActivity({
      action: "api_import",
      entityType: "Lead",
      entityId: lead.id,
      details: { via: "cowork_api", source: lead.source },
    });

    return NextResponse.json({ success: true, lead }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: err.issues[0].message },
        { status: 400 },
      );
    }
    logger.error("Cowork Leads POST", { err });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});

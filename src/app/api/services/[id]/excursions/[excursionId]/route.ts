/**
 * PATCH one excursion — attach or review its risk assessment, or move
 * it to completed / cancelled.
 *
 * There is no DELETE. An excursion that happened is a record: the risk
 * assessment, who reviewed it, and who consented are exactly what gets
 * asked for after an incident. Cancelling keeps all of it.
 *
 * Reviewing the risk assessment stamps the reviewer from the SESSION,
 * never from the request body — the whole value of "reviewed by" is that
 * the person can't be typed in by someone else.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isTrustedBlobUrl } from "@/lib/trusted-urls";

const ORG_WIDE_ROLES = new Set(["owner", "head_office", "admin", "eos"]);
/** Who can sign off a risk assessment — not the person who wrote it. */
const REVIEWER_ROLES = new Set(["owner", "head_office", "admin", "member"]);

const patchSchema = z
  .object({
    status: z.enum(["planned", "completed", "cancelled"]).optional(),
    riskAssessmentUrl: z
      .string()
      .url()
      .refine(isTrustedBlobUrl, {
        message: "Risk assessment must be uploaded here",
      })
      .optional(),
    riskAssessmentFileName: z.string().max(200).optional(),
    /** True = mark reviewed now, by the caller. False = un-review. */
    reviewRiskAssessment: z.boolean().optional(),
    notes: z.string().trim().max(4000).optional(),
    transport: z.string().trim().max(120).optional(),
    departTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    returnTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id, excursionId } = (await context!.params!) as {
      id: string;
      excursionId: string;
    };

    if (
      !ORG_WIDE_ROLES.has(session!.user.role) &&
      session!.user.serviceId !== id
    ) {
      throw ApiError.forbidden("You do not have access to this service");
    }

    const parsed = patchSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const d = parsed.data;

    const existing = await prisma.serviceExcursion.findUnique({
      where: { id: excursionId },
      select: { id: true, serviceId: true, riskAssessmentUrl: true },
    });
    if (!existing || existing.serviceId !== id) {
      throw ApiError.notFound("Excursion not found");
    }

    // Reviewing something that isn't there would record a sign-off on an
    // empty file — the exact false comfort this field exists to prevent.
    if (d.reviewRiskAssessment === true) {
      if (!REVIEWER_ROLES.has(session!.user.role)) {
        throw ApiError.forbidden(
          "Only a coordinator or above can sign off a risk assessment",
        );
      }
      const willHaveUrl = d.riskAssessmentUrl ?? existing.riskAssessmentUrl;
      if (!willHaveUrl) {
        throw ApiError.badRequest(
          "Attach the risk assessment before marking it reviewed",
        );
      }
    }

    const updated = await prisma.serviceExcursion.update({
      where: { id: excursionId },
      data: {
        ...(d.status ? { status: d.status } : {}),
        ...(d.riskAssessmentUrl
          ? {
              riskAssessmentUrl: d.riskAssessmentUrl,
              riskAssessmentFileName: d.riskAssessmentFileName ?? null,
              // A new document is a new document: it needs reviewing
              // again, unless this same call reviews it.
              ...(d.reviewRiskAssessment === true
                ? {}
                : {
                    riskAssessmentReviewedAt: null,
                    riskAssessmentReviewedById: null,
                  }),
            }
          : {}),
        ...(d.reviewRiskAssessment === true
          ? {
              riskAssessmentReviewedAt: new Date(),
              riskAssessmentReviewedById: session!.user.id,
            }
          : {}),
        ...(d.reviewRiskAssessment === false
          ? {
              riskAssessmentReviewedAt: null,
              riskAssessmentReviewedById: null,
            }
          : {}),
        ...(d.notes !== undefined ? { notes: d.notes } : {}),
        ...(d.transport !== undefined ? { transport: d.transport } : {}),
        ...(d.departTime !== undefined ? { departTime: d.departTime } : {}),
        ...(d.returnTime !== undefined ? { returnTime: d.returnTime } : {}),
      },
    });

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);

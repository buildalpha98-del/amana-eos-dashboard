import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { EVIDENCE_SLOTS } from "@/lib/nqs-taxonomy";

const ORG_WIDE_ROLES = new Set(["owner", "head_office", "admin"]);

const reviewSchema = z.object({
  action: z.enum(["accept", "edit", "reject"]),
  text: z.string().trim().min(1).max(20_000).optional(),
});

/**
 * PATCH /api/qip/[id]/suggestions/[suggestionId]
 *
 * Director review of one AI-proposed SAT/QIP update:
 * - accept → patch the quality-area field with proposedText
 * - edit   → patch with the director's edited text (stored on the row)
 * - reject → no document change
 * Accept/edit bump the QIP's lastReviewDate/reviewedById. The suggestion row
 * is never deleted — it is the audit trail.
 */
export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id: qipId, suggestionId } = await context!.params!;

    const body = await parseJsonBody(req);
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { action, text } = parsed.data;
    if (action === "edit" && !text) {
      throw ApiError.badRequest("edit requires text");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const suggestion = await tx.qipSuggestion.findFirst({
        where: { id: suggestionId, qipId },
        include: { qip: { select: { serviceId: true } } },
      });
      if (!suggestion) throw ApiError.notFound("Suggestion not found");
      if (
        !ORG_WIDE_ROLES.has(session.user.role) &&
        session.user.serviceId !== suggestion.qip.serviceId
      ) {
        throw ApiError.forbidden("You do not have access to this service's QIP");
      }
      if (suggestion.status !== "pending") {
        throw ApiError.conflict("Suggestion has already been reviewed");
      }

      if (action !== "reject") {
        const finalText = action === "edit" ? text! : suggestion.proposedText;

        if (suggestion.field === "evidence" && suggestion.elementCode) {
          // Element-level evidence: fill the first empty of the 5 slots.
          const existing = await tx.satElementAssessment.findUnique({
            where: {
              qipId_elementCode: { qipId, elementCode: suggestion.elementCode },
            },
            select: { evidence: true },
          });
          const evidence = [...(existing?.evidence ?? [])];
          const emptyIdx = evidence.findIndex((e) => !e.trim());
          if (emptyIdx >= 0) {
            evidence[emptyIdx] = finalText;
          } else if (evidence.length < EVIDENCE_SLOTS) {
            evidence.push(finalText);
          } else {
            throw ApiError.conflict(
              `Element ${suggestion.elementCode} already has ${EVIDENCE_SLOTS} evidence entries — edit the element to free a slot first`,
            );
          }
          await tx.satElementAssessment.upsert({
            where: {
              qipId_elementCode: { qipId, elementCode: suggestion.elementCode },
            },
            create: { qipId, elementCode: suggestion.elementCode, evidence },
            update: { evidence },
          });
        } else {
          // Legacy per-QA-field suggestion (pre-element rows).
          await tx.qIPQualityArea.update({
            where: {
              qipId_qualityArea: { qipId, qualityArea: suggestion.qualityArea },
            },
            data: { [suggestion.field]: finalText },
          });
        }

        await tx.qualityImprovementPlan.update({
          where: { id: qipId },
          data: { lastReviewDate: new Date(), reviewedById: session.user.id },
        });
      }

      const row = await tx.qipSuggestion.update({
        where: { id: suggestion.id },
        data: {
          status:
            action === "accept" ? "accepted" : action === "edit" ? "edited" : "rejected",
          ...(action === "edit" ? { proposedText: text! } : {}),
          reviewedById: session.user.id,
          reviewedAt: new Date(),
        },
      });

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "reviewed_qip_suggestion",
          entityType: "QipSuggestion",
          entityId: suggestion.id,
          details: {
            qipId,
            qualityArea: suggestion.qualityArea,
            field: suggestion.field,
            outcome: row.status,
          },
        },
      });

      return row;
    });

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);

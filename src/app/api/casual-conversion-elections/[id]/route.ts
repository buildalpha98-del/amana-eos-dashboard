/**
 * PATCH /api/casual-conversion-elections/[id] — record the response
 *
 * Used by admin to record the employer's response to a pending
 * election. The response must be in writing within 21 days of the
 * election (s66B(2)). Late responses are still accepted by this
 * endpoint (admin documenting a real situation) but flagged in the
 * activity log so we can spot the pattern.
 *
 * Declines REQUIRE `declineReasons` per s66B(3) — without specific
 * grounds the refusal is unlawful.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const patchSchema = z.object({
  response: z.enum(["accepted", "declined"]),
  // Required for declined responses (s66B(3) compliance).
  declineReasons: z.string().max(20_000).optional().nullable(),
  // If accepted, the EmploymentContract that was issued. Optional so
  // admin can record the response now and link the contract later.
  newContractId: z.string().min(1).optional().nullable(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as RouteContext).params;

    const raw = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }

    if (
      parsed.data.response === "declined" &&
      (!parsed.data.declineReasons ||
        parsed.data.declineReasons.trim().length < 20)
    ) {
      // s66B(3) gives only specific grounds for refusal — undocumented
      // declines are unlawful. Force the admin to type the grounds.
      throw ApiError.badRequest(
        "Decline responses require declineReasons of at least 20 characters citing the s66B(3) grounds relied on.",
      );
    }

    const existing = await prisma.casualConversionElection.findUnique({
      where: { id },
    });
    if (!existing || existing.deleted) {
      throw ApiError.notFound("Election not found");
    }
    if (existing.respondedAt) {
      throw ApiError.conflict(
        "This election has already been responded to. Create a new election instead of overwriting.",
      );
    }

    // Optional contract verification: if accepted + contract id given,
    // confirm the contract exists and is permanent (not still casual).
    if (parsed.data.response === "accepted" && parsed.data.newContractId) {
      const contract = await prisma.employmentContract.findUnique({
        where: { id: parsed.data.newContractId },
        select: { contractType: true, userId: true },
      });
      if (!contract) {
        throw ApiError.badRequest("Linked contract not found.");
      }
      if (contract.userId !== existing.userId) {
        throw ApiError.badRequest(
          "Linked contract belongs to a different staff member.",
        );
      }
      // ContractType enum values are prefixed `ct_` in the schema.
      if (contract.contractType === "ct_casual") {
        throw ApiError.badRequest(
          "Linked contract is still casual — issue a permanent (or fixed-term) contract before linking.",
        );
      }
    }

    const updated = await prisma.casualConversionElection.update({
      where: { id },
      data: {
        respondedAt: new Date(),
        respondedById: session!.user.id,
        response: parsed.data.response,
        declineReasons: parsed.data.declineReasons ?? null,
        newContractId:
          parsed.data.response === "accepted"
            ? parsed.data.newContractId ?? null
            : null,
      },
      include: {
        respondedBy: { select: { id: true, name: true } },
        newContract: {
          select: {
            id: true,
            contractType: true,
            startDate: true,
            payRate: true,
          },
        },
      },
    });

    // Flag late responses (post-21-day window) for monitoring.
    const daysToRespond =
      (updated.respondedAt!.getTime() - existing.electedAt.getTime()) /
      86400000;

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "casual_conversion_election_responded",
        entityType: "CasualConversionElection",
        entityId: id,
        details: {
          response: parsed.data.response,
          daysToRespond: Math.round(daysToRespond * 10) / 10,
          late: daysToRespond > 21,
          newContractId: updated.newContractId,
        },
      },
    });

    if (daysToRespond > 21) {
      logger.warn(
        "Casual conversion responded outside the 21-day s66B window",
        {
          electionId: id,
          daysToRespond,
          response: parsed.data.response,
        },
      );
    }

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin"] },
);

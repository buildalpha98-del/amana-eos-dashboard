import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { briefIncludeFor, toListItem } from "@/lib/vendor-brief/list-item";
import {
  dataForTransition,
  fillIntermediateTimestamps,
  isValidTransition,
} from "@/lib/vendor-brief/transitions";
import { VendorBriefStatus } from "@prisma/client";

const ROLES: ("marketing" | "owner")[] = ["marketing", "owner"];

type RouteCtx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  toStatus: z.nativeEnum(VendorBriefStatus),
  occurredAt: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * POST /api/marketing/vendor-briefs/[id]/transition
 *
 * Status transitions. Validates the from→to move, fills in any skipped
 * intermediate timestamps, and stores notes (used as cancellationReason
 * when toStatus is "cancelled" — required in that case).
 */
export const POST = withApiAuth(
  async (req, _session, context) => {
    const { id } = await (context as unknown as RouteCtx).params;

    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid transition payload", parsed.error.flatten());
    }
    const { toStatus, occurredAt, notes } = parsed.data;

    const existing = await prisma.vendorBrief.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        briefSentAt: true,
        acknowledgedAt: true,
        quoteReceivedAt: true,
        quoteApprovedAt: true,
        approvedAt: true,
        orderedAt: true,
        deliveredAt: true,
        installedAt: true,
      },
    });
    if (!existing) throw ApiError.notFound("Vendor brief not found");

    if (!isValidTransition(existing.status, toStatus)) {
      throw ApiError.badRequest(
        `Cannot transition from ${existing.status} to ${toStatus}.`,
      );
    }

    // cancellation requires a reason in `notes`.
    if (toStatus === "cancelled" && !notes?.trim()) {
      throw ApiError.badRequest(
        "Cancelling a brief requires a reason in the `notes` field.",
      );
    }

    const at = occurredAt ?? new Date();

    const data: Record<string, unknown> = {
      ...dataForTransition(toStatus, at),
      ...fillIntermediateTimestamps(toStatus, at, existing),
    };

    if (toStatus === "cancelled") {
      data.cancellationReason = notes!.trim();
    } else if (notes?.trim()) {
      // Append to existing notes for non-cancellation transitions.
      const stamp = new Date().toISOString();
      data.notes = (existing as { notes?: string | null }).notes
        ? `${(existing as { notes?: string | null }).notes}\n\n— ${stamp}: ${notes.trim()}`
        : `${stamp}: ${notes.trim()}`;
    }

    const updated = await prisma.vendorBrief.update({
      where: { id },
      data,
      include: briefIncludeFor,
    });

    return NextResponse.json({ brief: toListItem(updated) });
  },
  { roles: ROLES },
);

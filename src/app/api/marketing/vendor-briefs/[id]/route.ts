import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { briefIncludeFor, toListItem } from "@/lib/vendor-brief/list-item";
import { TermReadinessCategory, VendorBriefType } from "@prisma/client";
import { isTerminal } from "@/lib/vendor-brief/transitions";

const ROLES: ("marketing" | "owner" | "head_office" | "admin")[] = ["marketing", "owner", "head_office", "admin"];

type RouteCtx = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET — full detail
// ---------------------------------------------------------------------------

export const GET = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await (context as unknown as RouteCtx).params;

    const brief = await prisma.vendorBrief.findUnique({
      where: { id },
      include: briefIncludeFor,
    });
    if (!brief) throw ApiError.notFound("Vendor brief not found");

    // Detail returns the same list-item shape PLUS the structured body fields
    // and full notes. (Keeps the read endpoint a superset of the list shape.)
    const item = toListItem(brief);
    return NextResponse.json({
      brief: {
        ...item,
        briefBody: brief.briefBody,
        specifications: brief.specifications,
        quantity: brief.quantity,
        deliveryAddress: brief.deliveryAddress,
        notes: brief.notes,
        cancellationReason: brief.cancellationReason,
        escalationReason: brief.escalationReason,
        vendorName: brief.vendorName,
      },
    });
  },
  { roles: ROLES },
);

// ---------------------------------------------------------------------------
// PATCH — edit content fields (NOT status)
// ---------------------------------------------------------------------------

const patchBodySchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    type: z.nativeEnum(VendorBriefType).optional(),
    serviceId: z.string().optional().nullable(),
    vendorContactId: z.string().optional().nullable(),
    briefBody: z.string().max(20000).optional().nullable(),
    specifications: z.string().max(5000).optional().nullable(),
    quantity: z.number().int().min(0).optional().nullable(),
    deliveryAddress: z.string().max(2000).optional().nullable(),
    deliveryDeadline: z.coerce.date().optional().nullable(),
    targetTermStart: z.coerce.date().optional().nullable(),
    termYear: z.number().int().min(2025).max(2100).optional().nullable(),
    termNumber: z.number().int().min(1).max(4).optional().nullable(),
    termReadinessCategory: z.nativeEnum(TermReadinessCategory).optional().nullable(),
    notes: z.string().max(20000).optional().nullable(),
  })
  .refine(
    (d) => {
      // If any term-readiness field is being set, all three must be set
      // (or all explicitly cleared together).
      const fields = [
        d.termYear,
        d.termNumber,
        d.termReadinessCategory,
      ].filter((v) => v !== undefined);
      if (fields.length === 0) return true;
      const allNull = fields.every((v) => v === null);
      const allSet = fields.every((v) => v !== null);
      return fields.length === 3 && (allNull || allSet);
    },
    {
      message:
        "Term-readiness fields must be updated together (set all 3 or clear all 3).",
    },
  );

export const PATCH = withApiAuth(
  async (req, _session, context) => {
    const { id } = await (context as unknown as RouteCtx).params;

    const existing = await prisma.vendorBrief.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) throw ApiError.notFound("Vendor brief not found");

    if (isTerminal(existing.status)) {
      throw new ApiError(
        409,
        `Brief is ${existing.status} — content edits are no longer allowed. Reopen via a new brief if needed.`,
      );
    }

    const raw = await parseJsonBody(req);
    const parsed = patchBodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid patch payload", parsed.error.flatten());
    }

    const updated = await prisma.vendorBrief.update({
      where: { id },
      data: parsed.data,
      include: briefIncludeFor,
    });

    return NextResponse.json({ brief: toListItem(updated) });
  },
  { roles: ROLES },
);

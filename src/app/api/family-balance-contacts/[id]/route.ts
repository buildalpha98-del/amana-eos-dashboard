/**
 * PATCH  /api/family-balance-contacts/[id] — edit an existing contact log
 * DELETE /api/family-balance-contacts/[id] — remove one
 *
 * PATCH keeps things minimal: mutable fields are outcome + notes +
 * followUpDate + amountOwing (the numbers most likely to need correction
 * after the call). If the follow-up todo exists, deleting the contact
 * leaves the todo intact — admin can decide separately whether the
 * task is still relevant.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const CONTACT_OUTCOMES = [
  "answered",
  "no_answer",
  "promised_payment",
  "disputed",
  "payment_plan",
  "other",
] as const;

const patchSchema = z.object({
  outcome: z.enum(CONTACT_OUTCOMES).optional(),
  outcomeNotes: z.string().max(5000).nullable().optional(),
  followUpDate: z.string().datetime().nullable().optional(),
  amountOwing: z.number().nonnegative().optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as RouteCtx).params;
    const raw = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }

    const existing = await prisma.familyBalanceContact.findUnique({
      where: { id },
    });
    if (!existing) throw ApiError.notFound("Contact log not found");

    const updated = await prisma.familyBalanceContact.update({
      where: { id },
      data: {
        ...(parsed.data.outcome !== undefined ? { outcome: parsed.data.outcome } : {}),
        ...(parsed.data.outcomeNotes !== undefined
          ? { outcomeNotes: parsed.data.outcomeNotes }
          : {}),
        ...(parsed.data.followUpDate !== undefined
          ? { followUpDate: parsed.data.followUpDate ? new Date(parsed.data.followUpDate) : null }
          : {}),
        ...(parsed.data.amountOwing !== undefined
          ? { amountOwing: parsed.data.amountOwing }
          : {}),
      },
    });

    return NextResponse.json({
      ...updated,
      amountOwing: Number(updated.amountOwing),
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const { id } = await (context as unknown as RouteCtx).params;
    const existing = await prisma.familyBalanceContact.findUnique({
      where: { id },
      select: { id: true, parentName: true },
    });
    if (!existing) throw ApiError.notFound("Contact log not found");

    await prisma.familyBalanceContact.delete({ where: { id } });
    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "delete",
        entityType: "FamilyBalanceContact",
        entityId: id,
        details: { parentName: existing.parentName },
      },
    });

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "head_office", "admin"] },
);

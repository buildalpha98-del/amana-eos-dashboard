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

const CONTACT_METHODS = ["email", "phone", "sms", "in_person"] as const;
const CONTACT_OUTCOMES = [
  "answered",
  "no_answer",
  "promised_payment",
  "disputed",
  "payment_plan",
  "other",
] as const;

// 2026-07-23: widened from outcome/notes/followUp/amount to cover every
// field on the form. Daniel wants to correct typos on the parent name,
// method, contacted-at date, etc. after a call.
const patchSchema = z.object({
  accountName: z.string().min(1).max(200).optional(),
  parentName: z.string().min(1).max(200).optional(),
  mobileNumber: z.string().max(50).nullable().optional(),
  amountOwing: z.number().nonnegative().optional(),
  contactedAt: z.string().datetime().optional(),
  contactMethod: z.enum(CONTACT_METHODS).optional(),
  outcome: z.enum(CONTACT_OUTCOMES).optional(),
  outcomeNotes: z.string().max(5000).nullable().optional(),
  followUpDate: z.string().datetime().nullable().optional(),
  serviceId: z.string().nullable().optional(),
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

    const d = parsed.data;
    const updated = await prisma.familyBalanceContact.update({
      where: { id },
      data: {
        ...(d.accountName !== undefined ? { accountName: d.accountName } : {}),
        ...(d.parentName !== undefined ? { parentName: d.parentName } : {}),
        ...(d.mobileNumber !== undefined ? { mobileNumber: d.mobileNumber } : {}),
        ...(d.amountOwing !== undefined ? { amountOwing: d.amountOwing } : {}),
        ...(d.contactedAt !== undefined
          ? { contactedAt: new Date(d.contactedAt) }
          : {}),
        ...(d.contactMethod !== undefined ? { contactMethod: d.contactMethod } : {}),
        ...(d.outcome !== undefined ? { outcome: d.outcome } : {}),
        ...(d.outcomeNotes !== undefined ? { outcomeNotes: d.outcomeNotes } : {}),
        ...(d.followUpDate !== undefined
          ? { followUpDate: d.followUpDate ? new Date(d.followUpDate) : null }
          : {}),
        ...(d.serviceId !== undefined ? { serviceId: d.serviceId } : {}),
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

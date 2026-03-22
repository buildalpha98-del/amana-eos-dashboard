import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

const patchSchema = z.object({
  amountPaid: z.number().optional(),
  reminderStatus: z.string().optional(),
  resolution: z.string().optional(),
  notes: z.string().optional(),
  assigneeId: z.string().optional(),
  firstReminderSentAt: z.string().optional(),
  secondReminderSentAt: z.string().optional(),
  formalNoticeSentAt: z.string().optional(),
  escalatedAt: z.string().optional(),
});
/**
 * GET /api/billing/overdue/[id]
 */
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  try {
    const record = await prisma.overdueFeeRecord.findUnique({
      where: { id },
      include: {
        service: { select: { id: true, name: true, code: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
    if (!record || record.deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(record);
  } catch (err) {
    logger.error("Billing Overdue GET/:id", { err });
    return NextResponse.json({ error: "Failed to fetch record" }, { status: 500 });
  }
});

/**
 * PATCH /api/billing/overdue/[id]
 * Update status, payments, notes, assignee
 */
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  try {
    const raw = await req.json();
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const existing = await prisma.overdueFeeRecord.findUnique({ where: { id } });
    if (!existing || existing.deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.amountPaid !== undefined) {
      data.amountPaid = body.amountPaid;
      data.balance = existing.amountDue - body.amountPaid;
    }
    if (body.reminderStatus !== undefined) data.reminderStatus = body.reminderStatus;
    if (body.resolution !== undefined) {
      data.resolution = body.resolution;
      data.reminderStatus = "resolved";
      data.resolvedAt = new Date();
    }
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId;
    if (body.firstReminderSentAt !== undefined) data.firstReminderSentAt = new Date(body.firstReminderSentAt);
    if (body.secondReminderSentAt !== undefined) data.secondReminderSentAt = new Date(body.secondReminderSentAt);
    if (body.formalNoticeSentAt !== undefined) data.formalNoticeSentAt = new Date(body.formalNoticeSentAt);
    if (body.escalatedAt !== undefined) data.escalatedAt = new Date(body.escalatedAt);

    const record = await prisma.overdueFeeRecord.update({
      where: { id },
      data,
      include: {
        service: { select: { id: true, name: true, code: true } },
        assignee: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(record);
  } catch (err) {
    logger.error("Billing Overdue PATCH/:id", { err });
    return NextResponse.json({ error: "Failed to update record" }, { status: 500 });
  }
}, { roles: ["owner", "head_office", "admin"] });

/**
 * DELETE /api/billing/overdue/[id]
 * Soft delete
 */
export const DELETE = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  try {
    await prisma.overdueFeeRecord.update({
      where: { id },
      data: { deleted: true },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Billing Overdue DELETE/:id", { err });
    return NextResponse.json({ error: "Failed to delete record" }, { status: 500 });
  }
}, { roles: ["owner", "head_office"] });

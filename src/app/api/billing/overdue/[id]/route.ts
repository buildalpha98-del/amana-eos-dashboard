import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * GET /api/billing/overdue/[id]
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

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
    console.error("[Billing Overdue GET/:id]", err);
    return NextResponse.json({ error: "Failed to fetch record" }, { status: 500 });
  }
}

/**
 * PATCH /api/billing/overdue/[id]
 * Update status, payments, notes, assignee
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;

  try {
    const body = await req.json();
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
    console.error("[Billing Overdue PATCH/:id]", err);
    return NextResponse.json({ error: "Failed to update record" }, { status: 500 });
  }
}

/**
 * DELETE /api/billing/overdue/[id]
 * Soft delete
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth(["owner", "head_office"]);
  if (error) return error;

  const { id } = await params;

  try {
    await prisma.overdueFeeRecord.update({
      where: { id },
      data: { deleted: true },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Billing Overdue DELETE/:id]", err);
    return NextResponse.json({ error: "Failed to delete record" }, { status: 500 });
  }
}

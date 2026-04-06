import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { sendPaymentReceivedNotification } from "@/lib/notifications/billing";

const createPaymentSchema = z.object({
  statementId: z.string().optional(),
  contactId: z.string().min(1),
  serviceId: z.string().min(1),
  amount: z.number().positive("Amount must be positive"),
  method: z.enum(["bank_transfer", "cash", "card", "direct_debit", "other"]),
  reference: z.string().optional(),
  receivedAt: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = createPaymentSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten());
  }

  const {
    statementId,
    contactId,
    serviceId,
    amount,
    method,
    reference,
    receivedAt,
    notes,
  } = parsed.data;

  // If statementId provided, verify it exists and belongs to the contact
  if (statementId) {
    const statement = await prisma.statement.findUnique({
      where: { id: statementId },
      select: { id: true, contactId: true },
    });
    if (!statement) throw ApiError.notFound("Statement not found");
    if (statement.contactId !== contactId) {
      throw ApiError.badRequest("Statement does not belong to this contact");
    }
  }

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        statementId: statementId ?? null,
        contactId,
        serviceId,
        amount,
        method,
        reference: reference ?? null,
        receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
        recordedById: session.user?.id ?? null,
        notes: notes ?? null,
      },
    });

    // If linked to a statement, recalculate balance and status
    if (statementId) {
      const agg = await tx.payment.aggregate({
        where: { statementId },
        _sum: { amount: true },
      });
      const totalPayments = agg._sum.amount ?? 0;

      const stmt = await tx.statement.findUniqueOrThrow({
        where: { id: statementId },
        select: { gapFee: true },
      });

      const newBalance = stmt.gapFee - totalPayments;
      await tx.statement.update({
        where: { id: statementId },
        data: {
          amountPaid: totalPayments,
          balance: newBalance,
          status: newBalance <= 0 ? "paid" : undefined,
        },
      });
    }

    return created;
  });

  // Fire-and-forget notification
  void sendPaymentReceivedNotification(payment.id);

  // Re-fetch with statement info
  const result = await prisma.payment.findUniqueOrThrow({
    where: { id: payment.id },
    include: {
      statement: { select: { id: true, balance: true, status: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      service: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(result, { status: 201 });
});

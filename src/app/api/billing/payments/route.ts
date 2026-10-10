import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { sendPaymentReceivedNotification } from "@/lib/notifications/billing";
import { withStatementLock } from "@/lib/billing/statement-lock";

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

  const payment = await withStatementLock(serviceId, async (tx) => {
    // Validate inside the transaction, after other payment/invoice writers.
    if (statementId) {
      const statement = await tx.statement.findUnique({
        where: { id: statementId },
        select: { id: true, contactId: true, serviceId: true, status: true },
      });
      if (!statement) throw ApiError.notFound("Statement not found");
      if (statement.contactId !== contactId || statement.serviceId !== serviceId) {
        throw ApiError.badRequest("Statement does not belong to this contact and service");
      }
      if (statement.status === "void") throw ApiError.conflict("Cannot record payment against a void statement");
    }
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
        // A concurrent void must roll back this payment, never revive its invoice.
        where: { id: statementId, status: { not: "void" } },
        data: {
          amountPaid: totalPayments,
          balance: newBalance,
          status: newBalance <= 0 ? "paid" : undefined,
        },
      }).catch((err: unknown) => {
        if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
          throw ApiError.conflict("Statement changed; reload before recording payment");
        }
        throw err;
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
}, { roles: [...ADMIN_ROLES] });

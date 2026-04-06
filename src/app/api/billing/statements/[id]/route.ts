import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";

/* ------------------------------------------------------------------ */
/*  GET /api/billing/statements/[id] — statement detail               */
/* ------------------------------------------------------------------ */

export const GET = withApiAuth(async (_req, _session, context) => {
  const { id } = await context!.params!;

  const statement = await prisma.statement.findUnique({
    where: { id },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      service: { select: { id: true, name: true } },
      lineItems: {
        include: { child: { select: { id: true, firstName: true, surname: true } } },
        orderBy: { date: "asc" },
      },
      payments: {
        include: { recordedBy: { select: { id: true, name: true } } },
        orderBy: { receivedAt: "desc" },
      },
    },
  });

  if (!statement) throw ApiError.notFound("Statement not found");

  return NextResponse.json(statement);
});

/* ------------------------------------------------------------------ */
/*  PATCH /api/billing/statements/[id] — edit draft only              */
/* ------------------------------------------------------------------ */

const lineItemSchema = z.object({
  childId: z.string().min(1),
  date: z.string().min(1),
  sessionType: z.enum(["bsc", "asc", "vc"]),
  description: z.string().min(1),
  grossFee: z.number(),
  ccsHours: z.number(),
  ccsRate: z.number(),
  ccsAmount: z.number(),
  gapAmount: z.number(),
});

const updateStatementSchema = z.object({
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lineItems: z.array(lineItemSchema).min(1).optional(),
});

export const PATCH = withApiAuth(async (req, _session, context) => {
  const { id } = await context!.params!;

  const existing = await prisma.statement.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) throw ApiError.notFound("Statement not found");
  if (existing.status !== "draft") {
    throw ApiError.badRequest("Only draft statements can be edited");
  }

  const body = await parseJsonBody(req);
  const parsed = updateStatementSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten());
  }

  const { periodStart, periodEnd, dueDate, notes, lineItems } = parsed.data;

  const statement = await prisma.$transaction(async (tx) => {
    // If lineItems provided, delete existing and create new ones
    if (lineItems) {
      await tx.statementLineItem.deleteMany({ where: { statementId: id } });
      await tx.statementLineItem.createMany({
        data: lineItems.map((li) => ({
          statementId: id,
          childId: li.childId,
          date: new Date(li.date),
          sessionType: li.sessionType,
          description: li.description,
          grossFee: li.grossFee,
          ccsHours: li.ccsHours,
          ccsRate: li.ccsRate,
          ccsAmount: li.ccsAmount,
          gapAmount: li.gapAmount,
        })),
      });
    }

    // Recalculate totals if lineItems changed
    const totalsUpdate: Record<string, unknown> = {};
    if (lineItems) {
      const totalFees = lineItems.reduce((sum, li) => sum + li.grossFee, 0);
      const totalCcs = lineItems.reduce((sum, li) => sum + li.ccsAmount, 0);
      const gapFee = totalFees - totalCcs;
      totalsUpdate.totalFees = totalFees;
      totalsUpdate.totalCcs = totalCcs;
      totalsUpdate.gapFee = gapFee;
      totalsUpdate.balance = gapFee;
    }

    return tx.statement.update({
      where: { id },
      data: {
        ...(periodStart !== undefined ? { periodStart: new Date(periodStart) } : {}),
        ...(periodEnd !== undefined ? { periodEnd: new Date(periodEnd) } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...totalsUpdate,
      },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        service: { select: { id: true, name: true } },
        lineItems: {
          include: { child: { select: { id: true, firstName: true, surname: true } } },
          orderBy: { date: "asc" },
        },
      },
    });
  });

  return NextResponse.json(statement);
});

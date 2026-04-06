import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";

/* ------------------------------------------------------------------ */
/*  GET /api/billing/statements — list with filters + pagination      */
/* ------------------------------------------------------------------ */

export const GET = withApiAuth(async (req) => {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId") ?? undefined;
  const contactId = url.searchParams.get("contactId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const periodFrom = url.searchParams.get("periodFrom");
  const periodTo = url.searchParams.get("periodTo");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

  const where: Record<string, unknown> = {};
  if (serviceId) where.serviceId = serviceId;
  if (contactId) where.contactId = contactId;
  if (status) where.status = status;
  if (periodFrom || periodTo) {
    where.periodStart = {
      ...(periodFrom ? { gte: new Date(periodFrom) } : {}),
      ...(periodTo ? { lte: new Date(periodTo) } : {}),
    };
  }

  const [statements, total] = await prisma.$transaction([
    prisma.statement.findMany({
      where,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        service: { select: { id: true, name: true } },
        _count: { select: { lineItems: true, payments: true } },
      },
      orderBy: { periodStart: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.statement.count({ where }),
  ]);

  return NextResponse.json({ statements, total, page, limit });
});

/* ------------------------------------------------------------------ */
/*  POST /api/billing/statements — create a draft statement           */
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

const createStatementSchema = z.object({
  contactId: z.string().min(1),
  serviceId: z.string().min(1),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = withApiAuth(async (req) => {
  const body = await parseJsonBody(req);
  const parsed = createStatementSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten());
  }

  const { contactId, serviceId, periodStart, periodEnd, lineItems, dueDate, notes } = parsed.data;

  // Duplicate check: reject if non-void statement exists for same contact + period
  const existing = await prisma.statement.findFirst({
    where: {
      contactId,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      status: { not: "void" },
    },
    select: { id: true },
  });
  if (existing) {
    throw ApiError.conflict("A statement already exists for this contact and period");
  }

  // Auto-calculate totals
  const totalFees = lineItems.reduce((sum, li) => sum + li.grossFee, 0);
  const totalCcs = lineItems.reduce((sum, li) => sum + li.ccsAmount, 0);
  const gapFee = totalFees - totalCcs;

  const statement = await prisma.$transaction(async (tx) => {
    const created = await tx.statement.create({
      data: {
        contactId,
        serviceId,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        totalFees,
        totalCcs,
        gapFee,
        balance: gapFee,
        dueDate: dueDate ? new Date(dueDate) : null,
        notes: notes ?? null,
        lineItems: {
          create: lineItems.map((li) => ({
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
        },
      },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        service: { select: { id: true, name: true } },
        lineItems: true,
      },
    });

    return created;
  });

  return NextResponse.json(statement, { status: 201 });
});

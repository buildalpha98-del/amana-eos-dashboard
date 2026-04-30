import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServiceScope, getStateScope } from "@/lib/service-scope";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const postSchema = z.object({
  serviceId: z.string().min(1, "serviceId is required"),
  parentName: z.string().min(1, "parentName is required"),
  parentEmail: z.string().email().optional(),
  parentPhone: z.string().optional(),
  childName: z.string().optional(),
  invoiceRef: z.string().optional(),
  invoiceDate: z.string().min(1, "invoiceDate is required"),
  dueDate: z.string().min(1, "dueDate is required"),
  amountDue: z.number().positive("amountDue must be positive"),
  amountPaid: z.number().min(0).default(0),
  notes: z.string().optional(),
  assigneeId: z.string().optional(),
});

/**
 * GET /api/billing/overdue
 * List overdue fee records with filters + summary stats
 */
export const GET = withApiAuth(async (req, session) => {
const scope = getServiceScope(session);
  const stateScope = getStateScope(session);
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const agingBucket = searchParams.get("agingBucket");
  const reminderStatus = searchParams.get("reminderStatus");

  try {
    const where: Record<string, unknown> = { deleted: false };
    if (scope) {
      where.serviceId = scope;
    } else if (serviceId) {
      where.serviceId = serviceId;
    }
    if (stateScope) {
      where.service = { state: stateScope };
    }
    if (agingBucket) where.agingBucket = agingBucket;
    if (reminderStatus) where.reminderStatus = reminderStatus;

    const records = await prisma.overdueFeeRecord.findMany({
      where,
      include: {
        service: { select: { id: true, name: true, code: true } },
        assignee: { select: { id: true, name: true } },
      },
      orderBy: [{ daysOverdue: "desc" }, { balance: "desc" }],
    });

    // Summary stats
    const outstanding = records.filter(
      (r) => r.reminderStatus !== "resolved",
    );
    const totalOverdue = outstanding.reduce((sum, r) => sum + r.balance, 0);
    const familyCount = new Set(outstanding.map((r) => r.parentName)).size;

    const agingBreakdown = {
      current: outstanding.filter((r) => r.agingBucket === "current").length,
      "7d": outstanding.filter((r) => r.agingBucket === "7d").length,
      "14d": outstanding.filter((r) => r.agingBucket === "14d").length,
      "30d": outstanding.filter((r) => r.agingBucket === "30d").length,
      "45d": outstanding.filter((r) => r.agingBucket === "45d").length,
      "60plus": outstanding.filter((r) => r.agingBucket === "60plus").length,
    };

    const agingAmounts = {
      current: outstanding
        .filter((r) => r.agingBucket === "current")
        .reduce((s, r) => s + r.balance, 0),
      "7d": outstanding
        .filter((r) => r.agingBucket === "7d")
        .reduce((s, r) => s + r.balance, 0),
      "14d": outstanding
        .filter((r) => r.agingBucket === "14d")
        .reduce((s, r) => s + r.balance, 0),
      "30d": outstanding
        .filter((r) => r.agingBucket === "30d")
        .reduce((s, r) => s + r.balance, 0),
      "45d": outstanding
        .filter((r) => r.agingBucket === "45d")
        .reduce((s, r) => s + r.balance, 0),
      "60plus": outstanding
        .filter((r) => r.agingBucket === "60plus")
        .reduce((s, r) => s + r.balance, 0),
    };

    return NextResponse.json({
      records,
      count: records.length,
      summary: {
        totalOverdue,
        familyCount,
        outstandingCount: outstanding.length,
        agingBreakdown,
        agingAmounts,
      },
    });
  } catch (err) {
    logger.error("Billing Overdue GET", { err });
    return NextResponse.json(
      { error: "Failed to fetch overdue records" },
      { status: 500 },
    );
  }
});

/**
 * POST /api/billing/overdue
 * Create a new overdue fee record
 */
export const POST = withApiAuth(async (req, session) => {
try {
    const raw = await parseJsonBody(req);
    const parsed = postSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const {
      serviceId,
      parentName,
      parentEmail,
      parentPhone,
      childName,
      invoiceRef,
      invoiceDate,
      dueDate,
      amountDue,
      amountPaid,
      notes,
      assigneeId,
    } = parsed.data;

    const balance = amountDue - amountPaid;
    const now = new Date();
    const due = new Date(dueDate);
    const daysOverdue = Math.max(
      0,
      Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)),
    );

    let agingBucket = "current";
    if (daysOverdue >= 60) agingBucket = "60plus";
    else if (daysOverdue >= 45) agingBucket = "45d";
    else if (daysOverdue >= 30) agingBucket = "30d";
    else if (daysOverdue >= 14) agingBucket = "14d";
    else if (daysOverdue >= 7) agingBucket = "7d";

    const record = await prisma.overdueFeeRecord.create({
      data: {
        serviceId,
        parentName,
        parentEmail,
        parentPhone,
        childName,
        invoiceRef,
        invoiceDate: new Date(invoiceDate),
        dueDate: due,
        amountDue,
        amountPaid,
        balance,
        daysOverdue,
        agingBucket,
        notes,
        assigneeId: assigneeId || session!.user.id,
      },
      include: {
        service: { select: { id: true, name: true, code: true } },
        assignee: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    logger.error("Billing Overdue POST", { err });
    return NextResponse.json(
      { error: "Failed to create overdue record" },
      { status: 500 },
    );
  }
}, { roles: ["owner", "head_office", "admin"] });

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
const leaveTypeEnum = z.enum([
  "annual", "sick", "personal", "unpaid",
  "long_service", "parental", "compassionate",
]);

const balanceSchema = z.object({
  userEmail: z.string().email(),
  leaveType: leaveTypeEnum,
  balance: z.number(),
  accrued: z.number().optional(),
  taken: z.number().optional(),
  pending: z.number().optional(),
  source: z.string().optional(),
});

const syncBalancesSchema = z.object({
  action: z.literal("sync_balances"),
  balances: z.array(balanceSchema).min(1),
});

const createRequestSchema = z.object({
  action: z.literal("create_request"),
  userEmail: z.string().email(),
  leaveType: leaveTypeEnum,
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  totalDays: z.number().optional(),
  reason: z.string().nullable().optional(),
  serviceCode: z.string().optional(),
});

const bodySchema = z.discriminatedUnion("action", [
  syncBalancesSchema,
  createRequestSchema,
]);

/**
 * POST /api/cowork/hr/leave
 * Sync leave balances and/or create leave request records.
 * Used by: hr-leave-liability-scan, hr-staff-availability-forecast
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    if (parsed.data.action === "sync_balances") {
      const { balances } = parsed.data;

      let synced = 0;
      for (const bal of balances) {
        const user = await prisma.user.findFirst({
          where: { email: bal.userEmail },
          select: { id: true },
        });
        if (!user) continue;

        await prisma.leaveBalance.upsert({
          where: {
            userId_leaveType: {
              userId: user.id,
              leaveType: bal.leaveType,
            },
          },
          update: {
            balance: bal.balance,
            accrued: bal.accrued || 0,
            taken: bal.taken || 0,
            pending: bal.pending || 0,
            asOfDate: new Date(),
            source: bal.source || "cowork_automation",
          },
          create: {
            userId: user.id,
            leaveType: bal.leaveType,
            balance: bal.balance,
            accrued: bal.accrued || 0,
            taken: bal.taken || 0,
            pending: bal.pending || 0,
            source: bal.source || "cowork_automation",
          },
        });
        synced++;
      }

      return NextResponse.json(
        { message: "Leave balances synced", synced },
        { status: 201 }
      );
    }

    if (parsed.data.action === "create_request") {
      const {
        userEmail,
        leaveType,
        startDate,
        endDate,
        totalDays,
        reason,
        serviceCode,
      } = parsed.data;

      const user = await prisma.user.findFirst({
        where: { email: userEmail },
        select: { id: true },
      });
      if (!user) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }

      let serviceId: string | null = null;
      if (serviceCode) {
        const svc = await prisma.service.findUnique({
          where: { code: serviceCode },
          select: { id: true },
        });
        serviceId = svc?.id || null;
      }

      const request = await prisma.leaveRequest.create({
        data: {
          userId: user.id,
          leaveType,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          totalDays: totalDays || 1,
          reason: reason || null,
          status: "leave_pending",
          serviceId,
        },
      });

      return NextResponse.json(
        {
          message: "Leave request created",
          requestId: request.id,
          status: "leave_pending",
        },
        { status: 201 }
      );
    }

    // This is unreachable due to discriminated union validation, but keep for safety
    return NextResponse.json(
      {
        error: "Bad Request",
        message: "action must be sync_balances or create_request",
      },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("POST /cowork/hr/leave", { err });
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
});

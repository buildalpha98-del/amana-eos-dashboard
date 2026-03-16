import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * POST /api/cowork/hr/leave
 * Sync leave balances and/or create leave request records.
 * Used by: hr-leave-liability-scan, hr-staff-availability-forecast
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "sync_balances") {
      const { balances } = body;
      if (!balances || !Array.isArray(balances)) {
        return NextResponse.json(
          { error: "Bad Request", message: "balances[] required" },
          { status: 400 }
        );
      }

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

    if (action === "create_request") {
      const {
        userEmail,
        leaveType,
        startDate,
        endDate,
        totalDays,
        reason,
        serviceCode,
      } = body;

      const user = await prisma.user.findFirst({
        where: { email: userEmail },
        select: { id: true },
      });
      if (!user) {
        return NextResponse.json(
          { error: "Not Found", message: "User not found" },
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

    return NextResponse.json(
      {
        error: "Bad Request",
        message: "action must be sync_balances or create_request",
      },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[POST /cowork/hr/leave]", err);
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
}

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, serviceId: true },
  });

  if (!user?.serviceId) {
    return NextResponse.json({
      compliance: 0,
      pendingLeave: 0,
      openIssues: 0,
      staffCount: 0,
    });
  }

  const serviceId = user.serviceId;
  const now = new Date();

  // ── 1. Compliance Rate ────────────────────────────────────
  let compliance = 0;
  try {
    // Count staff at this service
    const staffAtService = await prisma.user.findMany({
      where: { serviceId, active: true, role: "staff" },
      select: { id: true },
    });

    if (staffAtService.length > 0) {
      const staffIds = staffAtService.map((s) => s.id);

      // Count staff with at least one valid (non-expired) certificate
      const staffWithValid = await prisma.complianceCertificate.groupBy({
        by: ["userId"],
        where: {
          serviceId,
          userId: { in: staffIds },
          expiryDate: { gt: now },
        },
      });

      const compliantCount = staffWithValid.length;
      compliance = Math.round((compliantCount / staffAtService.length) * 100);
    }
  } catch {
    // Certificate model may not match expected shape — default to 0
    compliance = 0;
  }

  // ── 2. Pending Leave Requests ─────────────────────────────
  const pendingLeave = await prisma.leaveRequest.count({
    where: {
      serviceId,
      status: "leave_pending",
    },
  });

  // ── 3. Open Issues ────────────────────────────────────────
  const openIssues = await prisma.issue.count({
    where: {
      serviceId,
      deleted: false,
      status: { notIn: ["closed", "solved"] },
    },
  });

  // ── 4. Staff Count ────────────────────────────────────────
  const staffCount = await prisma.user.count({
    where: {
      serviceId,
      active: true,
      role: "staff",
    },
  });

  return NextResponse.json({
    compliance,
    pendingLeave,
    openIssues,
    staffCount,
  });
}

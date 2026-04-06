import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";

export const GET = withParentAuth(async (_req, { parent }) => {
  if (parent.enrolmentIds.length === 0) {
    return NextResponse.json({ statements: [], summary: { currentBalance: 0, overdueCount: 0 } });
  }

  // Get serviceIds from parent's enrolments
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: parent.enrolmentIds }, status: { not: "draft" } },
    select: { serviceId: true },
  });
  const serviceIds = [...new Set(enrolments.map((e) => e.serviceId).filter(Boolean))] as string[];

  if (serviceIds.length === 0) {
    return NextResponse.json({ statements: [], summary: { currentBalance: 0, overdueCount: 0 } });
  }

  // Find CentreContact records for this parent
  const contacts = await prisma.centreContact.findMany({
    where: {
      email: parent.email.toLowerCase(),
      serviceId: { in: serviceIds },
    },
    select: { id: true },
  });
  const contactIds = contacts.map((c) => c.id);

  if (contactIds.length === 0) {
    return NextResponse.json({ statements: [], summary: { currentBalance: 0, overdueCount: 0 } });
  }

  const statements = await prisma.statement.findMany({
    where: {
      contactId: { in: contactIds },
      status: { notIn: ["draft", "void"] },
    },
    include: {
      service: { select: { id: true, name: true } },
    },
    orderBy: { periodEnd: "desc" },
  });

  // Calculate summary
  const outstandingStatements = statements.filter(
    (s) => s.status === "issued" || s.status === "unpaid" || s.status === "overdue",
  );
  const currentBalance = outstandingStatements.reduce((sum, s) => sum + s.balance, 0);
  const overdueCount = statements.filter((s) => s.status === "overdue").length;

  return NextResponse.json({
    statements,
    summary: { currentBalance, overdueCount },
  });
});

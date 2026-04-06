import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

type RouteContext = { params: Promise<{ familyId: string }> };

export const GET = withApiAuth(async (_req, _session, context) => {
  const { familyId } = await (context as RouteContext).params;

  const contact = await prisma.centreContact.findUnique({
    where: { id: familyId },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!contact) throw ApiError.notFound("Family not found");

  const [statements, payments] = await Promise.all([
    prisma.statement.findMany({
      where: { contactId: familyId, status: { notIn: ["void"] } },
      include: { service: { select: { id: true, name: true } } },
      orderBy: { periodStart: "desc" },
    }),
    prisma.payment.findMany({
      where: { contactId: familyId },
      orderBy: { receivedAt: "desc" },
    }),
  ]);

  const totalOutstanding = statements
    .filter((s) => ["issued", "unpaid", "overdue"].includes(s.status))
    .reduce((sum, s) => sum + s.balance, 0);

  return NextResponse.json({ contact, totalOutstanding, statements, payments });
});

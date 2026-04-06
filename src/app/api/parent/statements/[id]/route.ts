import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withParentAuth(async (_req, ctx) => {
  const { id } = await (ctx as RouteContext).params;
  const { parent } = ctx;

  // Get parent's contact IDs (same pattern as list route)
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: parent.enrolmentIds }, status: { not: "draft" } },
    select: { serviceId: true },
  });
  const serviceIds = [...new Set(enrolments.map((e) => e.serviceId).filter(Boolean))] as string[];

  const contacts = await prisma.centreContact.findMany({
    where: {
      email: parent.email.toLowerCase(),
      serviceId: { in: serviceIds },
    },
    select: { id: true },
  });
  const contactIds = contacts.map((c) => c.id);

  const statement = await prisma.statement.findUnique({
    where: { id },
    include: {
      service: { select: { id: true, name: true } },
      lineItems: {
        include: { child: { select: { id: true, firstName: true, surname: true } } },
        orderBy: { date: "asc" },
      },
    },
  });

  if (!statement) throw ApiError.notFound("Statement not found");
  if (!contactIds.includes(statement.contactId)) {
    throw ApiError.forbidden("You do not have access to this statement");
  }
  if (statement.status === "draft" || statement.status === "void") {
    throw ApiError.notFound("Statement not found");
  }

  return NextResponse.json(statement);
});

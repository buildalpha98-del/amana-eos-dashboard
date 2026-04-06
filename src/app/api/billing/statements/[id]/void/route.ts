import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

/* ------------------------------------------------------------------ */
/*  POST /api/billing/statements/[id]/void — void a statement         */
/* ------------------------------------------------------------------ */

export const POST = withApiAuth(async (_req, _session, context) => {
  const { id } = await context!.params!;

  const existing = await prisma.statement.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) throw ApiError.notFound("Statement not found");
  if (existing.status !== "draft" && existing.status !== "issued") {
    throw ApiError.badRequest("Only draft or issued statements can be voided");
  }

  const statement = await prisma.statement.update({
    where: { id },
    data: { status: "void" },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      service: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(statement);
});

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { processStatementDelivery } from "@/lib/billing/statement-delivery";
import { runAfter } from "@/lib/run-after";

/* ------------------------------------------------------------------ */
/*  POST /api/billing/statements/[id]/issue — issue a draft statement */
/* ------------------------------------------------------------------ */

export const POST = withApiAuth(async (_req, _session, context) => {
  const { id } = await context!.params!;

  const existing = await prisma.statement.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) throw ApiError.notFound("Statement not found");
  if (existing.status !== "draft") {
    throw ApiError.badRequest("Only draft statements can be issued");
  }

  const statement = await prisma.$transaction(async tx => {
    const issued = await tx.statement.update({
      where: { id, status: "draft" },
      data: {
        status: "issued",
        issuedAt: new Date(),
      },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        service: { select: { id: true, name: true } },
      },
    }).catch((err: unknown) => {
      if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
        throw ApiError.conflict("Statement changed; reload before issuing");
      }
      throw err;
    });
    await tx.statementDelivery.create({ data: { statementId: id } });
    return issued;
  });

  // Cron can recover this persisted job even if the request process terminates.
  runAfter(() => processStatementDelivery(id));

  return NextResponse.json(statement);
}, { roles: [...ADMIN_ROLES] });

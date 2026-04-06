import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { generateStatementPdf } from "@/lib/billing/statement-pdf";
import { sendStatementIssuedNotification } from "@/lib/notifications/billing";
import { logger } from "@/lib/logger";

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

  const statement = await prisma.statement.update({
    where: { id },
    data: {
      status: "issued",
      issuedAt: new Date(),
    },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      service: { select: { id: true, name: true } },
    },
  });

  // Fire-and-forget: generate PDF then send notification
  void (async () => {
    try {
      await generateStatementPdf(id);
      await sendStatementIssuedNotification(id);
    } catch (err) {
      logger.error("Issue post-processing failed", { statementId: id, err });
    }
  })();

  return NextResponse.json(statement);
});

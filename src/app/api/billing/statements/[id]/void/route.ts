import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";
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
    where: { id, status: { in: ["draft", "issued"] } },
    data: { status: "void" },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      service: { select: { id: true, name: true } },
    },
  }).catch((err: unknown) => {
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      throw ApiError.conflict("Statement changed; reload before voiding");
    }
    throw err;
  });

  return NextResponse.json(statement);
}, { roles: [...ADMIN_ROLES] });

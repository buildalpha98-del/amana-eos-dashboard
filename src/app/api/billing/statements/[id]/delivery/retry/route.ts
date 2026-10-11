import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { ApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { assertServiceAccess } from "@/lib/authz-scope";
import { retryStatementDelivery, processStatementDelivery } from "@/lib/billing/statement-delivery";
import { runAfter } from "@/lib/run-after";

export const POST = withApiAuth(async (req, session, context) => {
  if (req.headers.get("origin") !== req.nextUrl.origin) throw ApiError.forbidden("Retry must originate from this dashboard");
  const { id } = await context!.params!;
  const statement = await prisma.statement.findUnique({ where: { id }, select: { serviceId: true } });
  if (!statement) throw ApiError.notFound("Statement not found");
  assertServiceAccess(session, statement.serviceId);
  await retryStatementDelivery(id, session.user.id);
  runAfter(() => processStatementDelivery(id));
  return NextResponse.json({ queued: true }, { status: 202 });
}, { roles: [...ADMIN_ROLES], rateLimit: { max: 10, windowMs: 60_000 } });

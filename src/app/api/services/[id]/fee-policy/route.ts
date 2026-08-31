/**
 * GET/PATCH /api/services/[id]/fee-policy
 *
 * The centre's fee POLICY — what families get charged beyond the session
 * fee. Mirrors the app-settings route exactly: a dedicated endpoint per
 * settings group that takes the full blob and replaces it, so a value
 * can't survive being switched off.
 *
 * Writing is narrower than app settings on purpose. Room hours are an
 * operational detail a Director of Service adjusts; a late-collection
 * fee is a commercial decision that shows up on a family's invoice, so
 * PATCH is admin tier only. Reading stays open to the centre's own
 * Director, because staff on the floor need to be able to answer "what
 * does it cost if I'm late" without ringing head office.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import {
  feePolicySchema,
  resolveFeePolicy,
} from "@/lib/fee-policy";
import type { Prisma } from "@prisma/client";

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  const role = session.user.role ?? "";
  const ownService =
    (session.user as { serviceId?: string | null }).serviceId === id;
  if (!isAdminRole(role) && !ownService) throw ApiError.forbidden();

  const service = await prisma.service.findUnique({
    where: { id },
    select: { feePolicy: true },
  });
  if (!service) throw ApiError.notFound("Service not found");

  // Always fully resolved, so no caller has to remember which way an
  // absent value falls — and every absent value means "charge nothing".
  return NextResponse.json({
    settings: resolveFeePolicy(service.feePolicy),
  });
});

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  if (!isAdminRole(session.user.role ?? "")) throw ApiError.forbidden();

  const parsed = feePolicySchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid fee policy", parsed.error.flatten());
  }

  const service = await prisma.service.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!service) throw ApiError.notFound("Service not found");

  const updated = await prisma.service.update({
    where: { id },
    data: { feePolicy: parsed.data as Prisma.InputJsonValue },
    select: { feePolicy: true },
  });

  return NextResponse.json({
    settings: resolveFeePolicy(updated.feePolicy),
  });
});

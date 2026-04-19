/**
 * GET /api/calls/[id]/welcome-pack
 *
 * Generate and download a centre-specific welcome pack PDF for a call's parent.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { resolveServiceId } from "@/lib/vapi/centre-resolver";
import { generateWelcomePackPdf } from "@/lib/welcome-pack-pdf";

export const GET = withApiAuth(async (_req, _session, context) => {
  const { id } = await context!.params!;
  if (!id) throw ApiError.badRequest("Missing call ID");

  const call = await prisma.vapiCall.findUnique({ where: { id } });
  if (!call) throw ApiError.notFound("Call not found");
  if (!call.parentName) throw ApiError.badRequest("No parent name on this call");

  const serviceId = await resolveServiceId(call.centreName);
  if (!serviceId) throw ApiError.badRequest("Centre not recognised — cannot generate welcome pack");

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      name: true,
      address: true,
      suburb: true,
      state: true,
      postcode: true,
      phone: true,
      email: true,
      bscDailyRate: true,
      ascDailyRate: true,
      bscCasualRate: true,
      ascCasualRate: true,
      vcDailyRate: true,
    },
  });

  if (!service) throw ApiError.notFound("Service not found");

  const doc = await generateWelcomePackPdf({
    parentName: call.parentName,
    childName: call.childName ?? undefined,
    centre: service,
  });

  const buffer = Buffer.from(doc.output("arraybuffer"));

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Amana-OSHC-Welcome-Pack-${service.name.replace(/\s+/g, "-")}.pdf"`,
    },
  });
});

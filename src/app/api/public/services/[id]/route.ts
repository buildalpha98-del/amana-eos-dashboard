import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

/**
 * Lightweight public lookup for the public enquiry page (just enough to
 * render the centre name + suburb so visitors know which centre they're
 * enquiring with). No auth.
 */
export const GET = withApiHandler(async (_req, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) throw ApiError.badRequest("service id required");

  const service = await prisma.service.findUnique({
    where: { id },
    select: { id: true, name: true, suburb: true, state: true, status: true },
  });
  if (!service) throw ApiError.notFound("Centre not found");
  if (service.status !== "active" && service.status !== "onboarding") {
    throw ApiError.notFound("Centre not currently accepting enquiries");
  }

  return NextResponse.json({
    id: service.id,
    name: service.name,
    suburb: service.suburb,
    state: service.state,
  });
});

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// GET — List families (CentreContacts) for a service, used in message compose
// ---------------------------------------------------------------------------

export const GET = withApiAuth(async (req: NextRequest) => {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId");

  const where: Record<string, unknown> = {};
  if (serviceId) where.serviceId = serviceId;

  const families = await prisma.centreContact.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      serviceId: true,
      service: { select: { id: true, name: true } },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 200,
  });

  return NextResponse.json(families);
});

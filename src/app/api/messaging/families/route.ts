import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { resolveServiceIdFilter } from "@/lib/authz-scope";

// ---------------------------------------------------------------------------
// GET — List families (CentreContacts) for a service, used in message compose
// ---------------------------------------------------------------------------

export const GET = withApiAuth(async (req: NextRequest, session) => {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId");

  const where: Record<string, unknown> = {};
  // Centre-scope: non-admins only see their own service's family contact PII;
  // they can't enumerate other centres by passing a different ?serviceId=.
  const scopedServiceId = resolveServiceIdFilter(session, serviceId);
  if (scopedServiceId) where.serviceId = scopedServiceId;

  const families = await prisma.centreContact.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      mobile: true,
      smsOptIn: true,
      serviceId: true,
      service: { select: { id: true, name: true } },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 200,
  });

  return NextResponse.json(families);
});

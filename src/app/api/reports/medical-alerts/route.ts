import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { resolveServiceIdFilter } from "@/lib/authz-scope";

async function handler(req: NextRequest, session: Session) {
  const url = new URL(req.url);
  const requestedServiceId = url.searchParams.get("serviceId") || undefined;

  // Centre-scope: a member without ?serviceId would otherwise get EVERY
  // centre's child medical alerts. Pin non-admins to their own centre;
  // admins may filter by any centre or see all (undefined = no filter).
  const serviceId = resolveServiceIdFilter(session, requestedServiceId);

  const children = await prisma.child.findMany({
    where: {
      status: "active",
      ...(serviceId ? { serviceId } : {}),
      OR: [
        { medicalConditions: { isEmpty: false } },
        { anaphylaxisActionPlan: true },
        { AND: [{ medicationDetails: { not: null } }, { medicationDetails: { not: "" } }] },
      ],
    },
    select: {
      id: true,
      firstName: true,
      surname: true,
      dob: true,
      medicalConditions: true,
      dietaryRequirements: true,
      medicationDetails: true,
      anaphylaxisActionPlan: true,
      additionalNeeds: true,
      service: { select: { name: true } },
    },
    orderBy: [{ surname: "asc" }, { firstName: "asc" }],
  });

  const results = children.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.surname,
    dateOfBirth: c.dob,
    serviceName: c.service?.name ?? "",
    medicalConditions: c.medicalConditions,
    dietaryRequirements: c.dietaryRequirements,
    medicationDetails: c.medicationDetails,
    anaphylaxisActionPlan: c.anaphylaxisActionPlan,
    additionalNeeds: c.additionalNeeds,
  }));

  return NextResponse.json(results);
}

export const GET = withApiAuth(handler, { minRole: "member" });

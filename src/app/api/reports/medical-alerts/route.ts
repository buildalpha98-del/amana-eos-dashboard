import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

async function handler(req: NextRequest) {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId") || undefined;

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

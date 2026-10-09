import type { Session } from "next-auth";
import { resolveServiceIdFilter } from "@/lib/authz-scope";
import { serviceTodayISO } from "@/lib/timezone";
import { NextRequest } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { generateCsv, downloadCsvResponse } from "@/lib/reports/exportCsv";

async function handler(req: NextRequest, session: Session) {
  const url = new URL(req.url);
  const serviceId = resolveServiceIdFilter(session, url.searchParams.get("serviceId"));

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

  const headers = [
    "First Name",
    "Last Name",
    "Date of Birth",
    "Service",
    "Medical Conditions",
    "Dietary Requirements",
    "Medication Details",
    "Anaphylaxis Action Plan",
    "Additional Needs",
  ];

  const rows = children.map((c) => [
    c.firstName,
    c.surname,
    c.dob?.toISOString().slice(0, 10) ?? "",
    c.service?.name ?? "",
    (c.medicalConditions || []).join("; "),
    (c.dietaryRequirements || []).join("; "),
    c.medicationDetails || "",
    c.anaphylaxisActionPlan ? "Yes" : "No",
    c.additionalNeeds || "",
  ]);

  const csv = generateCsv(headers, rows);
  return downloadCsvResponse(csv, `medical-alerts-${serviceTodayISO()}`);
}

export const GET = withApiAuth(handler, { minRole: "member" });

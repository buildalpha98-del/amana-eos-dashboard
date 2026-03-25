import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";

export const GET = withParentAuth(async (_req, { parent }) => {
  // Fetch enrolment submissions to get children and service info
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: {
      id: { in: parent.enrolmentIds },
      status: { not: "draft" },
    },
    select: {
      id: true,
      primaryParent: true,
      secondaryParent: true,
      children: true,
      serviceId: true,
      childRecords: {
        select: {
          id: true,
          firstName: true,
          surname: true,
          yearLevel: true,
          schoolName: true,
          serviceId: true,
          service: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  // Build children list from structured Child records (preferred) or JSON fallback
  const children: Array<{
    id: string;
    firstName: string;
    surname: string;
    yearLevel: string | null;
    schoolName: string | null;
    serviceId: string | null;
    serviceName: string | null;
  }> = [];

  const servicesMap = new Map<string, string>();

  for (const enrolment of enrolments) {
    if (enrolment.childRecords.length > 0) {
      // Use structured Child records
      for (const child of enrolment.childRecords) {
        children.push({
          id: child.id,
          firstName: child.firstName,
          surname: child.surname,
          yearLevel: child.yearLevel,
          schoolName: child.schoolName,
          serviceId: child.service?.id ?? child.serviceId,
          serviceName: child.service?.name ?? null,
        });
        if (child.service) {
          servicesMap.set(child.service.id, child.service.name);
        }
      }
    } else {
      // Fallback: parse children JSON
      const childrenJson = enrolment.children as Array<Record<string, unknown>> | null;
      if (Array.isArray(childrenJson)) {
        for (const child of childrenJson) {
          children.push({
            id: `${enrolment.id}_${child.firstName}_${child.surname}`,
            firstName: (child.firstName as string) || "",
            surname: (child.surname as string) || "",
            yearLevel: (child.yearLevel as string) || null,
            schoolName: (child.school as string) || (child.schoolName as string) || null,
            serviceId: enrolment.serviceId,
            serviceName: null,
          });
        }
      }

      // Resolve service name for JSON-based children
      if (enrolment.serviceId && !servicesMap.has(enrolment.serviceId)) {
        const svc = await prisma.service.findUnique({
          where: { id: enrolment.serviceId },
          select: { id: true, name: true },
        });
        if (svc) {
          servicesMap.set(svc.id, svc.name);
          // Backfill serviceName
          for (const c of children) {
            if (c.serviceId === svc.id && !c.serviceName) {
              c.serviceName = svc.name;
            }
          }
        }
      }
    }
  }

  const services = Array.from(servicesMap.entries()).map(([id, name]) => ({
    id,
    name,
  }));

  return NextResponse.json({
    name: parent.name,
    email: parent.email,
    children,
    services,
  });
});

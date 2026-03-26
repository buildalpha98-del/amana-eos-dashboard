import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";

export const GET = withParentAuth(async (_req, { parent }) => {
  if (parent.enrolmentIds.length === 0) {
    return NextResponse.json([]);
  }

  // Get enrolments with children and emergency contacts
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: {
      id: { in: parent.enrolmentIds },
      status: { not: "draft" },
    },
    select: {
      id: true,
      children: true,
      serviceId: true,
      emergencyContacts: true,
      childRecords: {
        select: {
          id: true,
          firstName: true,
          surname: true,
          dob: true,
          yearLevel: true,
          schoolName: true,
          medical: true,
          serviceId: true,
          status: true,
          service: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  // Get attendance data for the last 7 days by service
  const serviceIds = new Set<string>();
  for (const e of enrolments) {
    if (e.serviceId) serviceIds.add(e.serviceId);
    for (const c of e.childRecords) {
      if (c.serviceId) serviceIds.add(c.serviceId);
    }
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const attendanceRecords =
    serviceIds.size > 0
      ? await prisma.dailyAttendance.findMany({
          where: {
            serviceId: { in: Array.from(serviceIds) },
            date: { gte: sevenDaysAgo },
          },
          select: { serviceId: true },
        })
      : [];

  // Count sessions per service
  const sessionCount = new Map<string, number>();
  for (const rec of attendanceRecords) {
    sessionCount.set(rec.serviceId, (sessionCount.get(rec.serviceId) || 0) + 1);
  }

  // Build children list as flat array matching ParentChild type
  const children: Array<{
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    yearLevel: string | null;
    serviceName: string;
    serviceId: string;
    medicalConditions: string[];
    allergies: string[];
    medications: string[];
    immunisationStatus: string | null;
    emergencyContacts: Array<{ id: string; name: string; phone: string; relationship: string }>;
    attendanceThisWeek: { attended: number; total: number };
  }> = [];

  for (const enrolment of enrolments) {
    // Parse emergency contacts from enrolment
    const emergencyContacts = parseEmergencyContacts(enrolment.emergencyContacts, enrolment.id);

    if (enrolment.childRecords.length > 0) {
      for (const child of enrolment.childRecords) {
        const svcId = child.serviceId || enrolment.serviceId;
        const sessions = svcId ? sessionCount.get(svcId) || 0 : 0;
        const medical = parseMedical(child.medical);

        children.push({
          id: child.id,
          firstName: child.firstName,
          lastName: child.surname,
          dateOfBirth: child.dob?.toISOString() ?? null,
          yearLevel: child.yearLevel,
          serviceId: child.service?.id ?? svcId ?? "",
          serviceName: child.service?.name ?? "",
          medicalConditions: medical.conditions,
          allergies: medical.allergies,
          medications: medical.medications,
          immunisationStatus: medical.immunisationStatus,
          emergencyContacts,
          attendanceThisWeek: {
            attended: sessions,
            total: Math.max(sessions, 5),
          },
        });
      }
    } else {
      // Fallback: parse children JSON
      const childrenJson = enrolment.children as Array<Record<string, unknown>> | null;
      if (Array.isArray(childrenJson)) {
        const sessions = enrolment.serviceId
          ? sessionCount.get(enrolment.serviceId) || 0
          : 0;

        for (const child of childrenJson) {
          const medical = parseMedical(child.medical);

          children.push({
            id: `${enrolment.id}_${child.firstName}_${child.surname}`,
            firstName: (child.firstName as string) || "",
            lastName: (child.surname as string) || "",
            dateOfBirth: (child.dob as string) || (child.dateOfBirth as string) || null,
            yearLevel: (child.yearLevel as string) || null,
            serviceId: enrolment.serviceId ?? "",
            serviceName: "",
            medicalConditions: medical.conditions,
            allergies: medical.allergies,
            medications: medical.medications,
            immunisationStatus: medical.immunisationStatus,
            emergencyContacts,
            attendanceThisWeek: {
              attended: sessions,
              total: Math.max(sessions, 5),
            },
          });
        }
      }
    }
  }

  // Resolve service names for children missing them
  const missingServiceIds = [
    ...new Set(children.filter((c) => !c.serviceName && c.serviceId).map((c) => c.serviceId)),
  ];
  if (missingServiceIds.length > 0) {
    const services = await prisma.service.findMany({
      where: { id: { in: missingServiceIds } },
      select: { id: true, name: true },
    });
    const svcMap = new Map(services.map((s) => [s.id, s.name]));
    for (const child of children) {
      if (!child.serviceName && child.serviceId) {
        child.serviceName = svcMap.get(child.serviceId) ?? "";
      }
    }
  }

  // Return flat array (not wrapped in { children })
  return NextResponse.json(children);
});

function parseMedical(medical: unknown): {
  conditions: string[];
  allergies: string[];
  medications: string[];
  immunisationStatus: string | null;
} {
  const result = {
    conditions: [] as string[],
    allergies: [] as string[],
    medications: [] as string[],
    immunisationStatus: null as string | null,
  };
  if (!medical || typeof medical !== "object") return result;
  const m = medical as Record<string, unknown>;

  if (Array.isArray(m.conditions)) {
    result.conditions = m.conditions.filter((c): c is string => typeof c === "string");
  } else if (Array.isArray(m.medicalConditions)) {
    result.conditions = m.medicalConditions.filter((c): c is string => typeof c === "string");
  } else if (typeof m.conditions === "string" && m.conditions) {
    result.conditions = [m.conditions];
  }

  if (Array.isArray(m.allergies)) {
    result.allergies = m.allergies.filter((a): a is string => typeof a === "string");
  } else if (typeof m.allergies === "string" && m.allergies) {
    result.allergies = [m.allergies];
  }

  if (Array.isArray(m.medications)) {
    result.medications = m.medications.filter((med): med is string => typeof med === "string");
  } else if (typeof m.medications === "string" && m.medications) {
    result.medications = [m.medications];
  }

  if (typeof m.immunisationStatus === "string") {
    result.immunisationStatus = m.immunisationStatus;
  } else if (typeof m.immunisation === "string") {
    result.immunisationStatus = m.immunisation;
  }

  return result;
}

function parseEmergencyContacts(
  data: unknown,
  enrolmentId: string,
): Array<{ id: string; name: string; phone: string; relationship: string }> {
  if (!Array.isArray(data)) return [];
  return data
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c, idx) => ({
      id: `ec-${enrolmentId}-${idx}`,
      name: (c.name as string) || "",
      phone: (c.phone as string) || "",
      relationship: (c.relationship as string) || "",
    }));
}

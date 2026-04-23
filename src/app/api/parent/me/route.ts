import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";

export const GET = withParentAuth(async (_req, { parent }) => {
  // Fetch enrolment submissions to get parent details and children
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: {
      id: { in: parent.enrolmentIds },
      status: { not: "draft" },
    },
    select: {
      id: true,
      primaryParent: true,
      secondaryParent: true,
      emergencyContacts: true,
      authorisedPickup: true,
      children: true,
      serviceId: true,
      childRecords: {
        select: {
          id: true,
          firstName: true,
          surname: true,
          yearLevel: true,
          schoolName: true,
          dob: true,
          medical: true,
          serviceId: true,
          service: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  // Resolve parent details from enrolment data
  const emailLower = parent.email.toLowerCase().trim();
  let firstName = "";
  let lastName = "";
  let phone: string | null = null;
  let address: { street: string; suburb: string; state: string; postcode: string } | null = null;
  let emergencyContacts: Array<{ id: string; name: string; phone: string; relationship: string }> = [];

  for (const enrolment of enrolments) {
    const primary = enrolment.primaryParent as Record<string, unknown> | null;
    const secondary = enrolment.secondaryParent as Record<string, unknown> | null;

    let matchedParent: Record<string, unknown> | null = null;

    if (
      primary &&
      typeof primary.email === "string" &&
      primary.email.toLowerCase().trim() === emailLower
    ) {
      matchedParent = primary;
    } else if (
      secondary &&
      typeof secondary.email === "string" &&
      secondary.email.toLowerCase().trim() === emailLower
    ) {
      matchedParent = secondary;
    }

    if (matchedParent && !firstName) {
      firstName = (matchedParent.firstName as string) || "";
      lastName = (matchedParent.surname as string) || (matchedParent.lastName as string) || "";
      phone = (matchedParent.mobile as string) || (matchedParent.phone as string) || null;

      const addr = matchedParent.address as Record<string, string> | null;
      if (addr && typeof addr === "object") {
        address = {
          street: addr.street || "",
          suburb: addr.suburb || "",
          state: addr.state || "",
          postcode: addr.postcode || "",
        };
      }
    }

    // Emergency contacts from first enrolment that has them
    if (emergencyContacts.length === 0 && enrolment.emergencyContacts) {
      const contacts = enrolment.emergencyContacts as Array<Record<string, unknown>>;
      if (Array.isArray(contacts)) {
        emergencyContacts = contacts.map((c, idx) => ({
          id: `ec-${enrolment.id}-${idx}`,
          name: (c.name as string) || "",
          phone: (c.phone as string) || "",
          relationship: (c.relationship as string) || "",
        }));
      }
    }
  }

  // Fallback name from JWT
  if (!firstName && parent.name) {
    const parts = parent.name.split(" ");
    firstName = parts[0] || "";
    lastName = parts.slice(1).join(" ") || "";
  }

  // Overlay structured profile fields from CentreContact (primary source of truth).
  // If multiple contact rows exist (one per service), prefer the most-recently-
  // updated one for the overlay.
  const contactRow = await prisma.centreContact.findFirst({
    where: { email: emailLower },
    orderBy: { updatedAt: "desc" },
    select: {
      firstName: true,
      lastName: true,
      mobile: true,
      dob: true,
      crn: true,
      relationship: true,
      occupation: true,
      workplace: true,
      workPhone: true,
      address: true,
    },
  });
  let profileDob: string | null = null;
  let profileCrn: string | null = null;
  let profileRelationship: string | null = null;
  let profileOccupation: string | null = null;
  let profileWorkplace: string | null = null;
  let profileWorkPhone: string | null = null;
  if (contactRow) {
    if (contactRow.firstName) firstName = contactRow.firstName;
    if (contactRow.lastName) lastName = contactRow.lastName;
    if (contactRow.mobile) phone = contactRow.mobile;
    if (contactRow.dob) profileDob = contactRow.dob.toISOString().slice(0, 10);
    profileCrn = contactRow.crn;
    profileRelationship = contactRow.relationship;
    profileOccupation = contactRow.occupation;
    profileWorkplace = contactRow.workplace;
    profileWorkPhone = contactRow.workPhone;
    const contactAddr = contactRow.address as Record<string, string> | null;
    if (contactAddr && typeof contactAddr === "object") {
      address = {
        street: contactAddr.street || address?.street || "",
        suburb: contactAddr.suburb || address?.suburb || "",
        state: contactAddr.state || address?.state || "",
        postcode: contactAddr.postcode || address?.postcode || "",
      };
    }
  }

  // Build children list with medical info
  const children: Array<{
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    yearLevel: string | null;
    serviceId: string | null;
    serviceName: string | null;
    medicalConditions: string[];
    allergies: string[];
    medications: string[];
    immunisationStatus: string | null;
    emergencyContacts: typeof emergencyContacts;
    attendanceThisWeek: { attended: number; total: number };
  }> = [];

  const servicesMap = new Map<string, string>();

  for (const enrolment of enrolments) {
    if (enrolment.childRecords.length > 0) {
      for (const child of enrolment.childRecords) {
        const medical = parseMedical(child.medical);
        children.push({
          id: child.id,
          firstName: child.firstName,
          lastName: child.surname,
          dateOfBirth: child.dob?.toISOString() ?? null,
          yearLevel: child.yearLevel,
          serviceId: child.service?.id ?? child.serviceId,
          serviceName: child.service?.name ?? null,
          medicalConditions: medical.conditions,
          allergies: medical.allergies,
          medications: medical.medications,
          immunisationStatus: medical.immunisationStatus,
          emergencyContacts,
          attendanceThisWeek: { attended: 0, total: 0 },
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
          const medical = parseMedical(child.medical);
          children.push({
            id: `${enrolment.id}_${child.firstName}_${child.surname}`,
            firstName: (child.firstName as string) || "",
            lastName: (child.surname as string) || "",
            dateOfBirth: (child.dob as string) || (child.dateOfBirth as string) || null,
            yearLevel: (child.yearLevel as string) || null,
            serviceId: enrolment.serviceId,
            serviceName: null,
            medicalConditions: medical.conditions,
            allergies: medical.allergies,
            medications: medical.medications,
            immunisationStatus: medical.immunisationStatus,
            emergencyContacts,
            attendanceThisWeek: { attended: 0, total: 0 },
          });
        }
      }
    }
  }

  // Get service-level attendance for the last 7 days to fill attendanceThisWeek
  const serviceIds = [...new Set(children.map((c) => c.serviceId).filter(Boolean))] as string[];
  if (serviceIds.length > 0) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const attendance = await prisma.dailyAttendance.findMany({
      where: {
        serviceId: { in: serviceIds },
        date: { gte: sevenDaysAgo },
      },
      select: { serviceId: true },
    });

    // Count sessions per service
    const sessionCount = new Map<string, number>();
    for (const rec of attendance) {
      sessionCount.set(rec.serviceId, (sessionCount.get(rec.serviceId) || 0) + 1);
    }

    for (const child of children) {
      if (child.serviceId) {
        const total = sessionCount.get(child.serviceId) || 0;
        child.attendanceThisWeek = {
          attended: total, // Service-level approximation
          total: Math.max(total, 5), // Cap at 5 business days
        };
      }
    }
  }

  // Resolve service names for JSON-based children
  for (const child of children) {
    if (child.serviceId && !child.serviceName && !servicesMap.has(child.serviceId)) {
      const svc = await prisma.service.findUnique({
        where: { id: child.serviceId },
        select: { id: true, name: true },
      });
      if (svc) servicesMap.set(svc.id, svc.name);
    }
    if (child.serviceId && !child.serviceName) {
      child.serviceName = servicesMap.get(child.serviceId) ?? null;
    }
  }

  // ── Sync authorised pickups from enrolment (idempotent, one-time) ──
  // Copies enrolment's authorisedPickup JSON to the AuthorisedPickup table
  // for each child that has zero pickups. Runs on every /me call but only
  // creates records once per child.
  try {
    const childIdsWithRecords = children
      .filter((c) => !c.id.includes("_")) // Skip JSON-based pseudo-IDs
      .map((c) => c.id);

    if (childIdsWithRecords.length > 0) {
      // Check which children already have authorised pickups
      const existingPickups = await prisma.authorisedPickup.groupBy({
        by: ["childId"],
        where: { childId: { in: childIdsWithRecords } },
      });
      const childrenWithPickups = new Set(existingPickups.map((p) => p.childId));

      // For children without pickups, sync from enrolment data
      for (const enrolment of enrolments) {
        const pickupData = enrolment.authorisedPickup as Array<Record<string, unknown>> | null;
        if (!Array.isArray(pickupData) || pickupData.length === 0) continue;

        for (const child of enrolment.childRecords) {
          if (childrenWithPickups.has(child.id)) continue; // Already has pickups

          const pickupsToCreate = pickupData
            .filter((p) => p.name && typeof p.name === "string")
            .map((p) => ({
              childId: child.id,
              name: (p.name as string).trim(),
              relationship: ((p.relationship as string) || "").trim(),
              phone: ((p.phone as string) || "").trim(),
              active: true,
              notes: typeof p.notes === "string" ? p.notes.trim() || null : null,
            }));

          if (pickupsToCreate.length > 0) {
            await prisma.authorisedPickup.createMany({
              data: pickupsToCreate,
              skipDuplicates: true,
            });
          }
        }
      }
    }
  } catch {
    // Non-critical — don't break the /me response if sync fails
  }

  return NextResponse.json({
    firstName,
    lastName,
    email: parent.email,
    phone,
    address,
    children,
    emergencyContacts,
    dob: profileDob,
    crn: profileCrn,
    relationship: profileRelationship,
    occupation: profileOccupation,
    workplace: profileWorkplace,
    workPhone: profileWorkPhone,
  });
});

/** Parse the medical JSON field from Child records into structured fields */
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
  } else if (typeof m.conditions === "string" && m.conditions) {
    result.conditions = [m.conditions];
  }
  if (Array.isArray(m.medicalConditions)) {
    result.conditions = m.medicalConditions.filter((c): c is string => typeof c === "string");
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

/**
 * OWNA sync logic — extracted from cron/owna-sync/route.ts
 *
 * Contains all helper functions and the per-service sync orchestrator.
 * The cron route handler imports `syncOwnaService` and loops over services.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { SessionType } from "@prisma/client";
import type { OwnaChild, OwnaIncident, OwnaClient } from "@/lib/owna";
import { logger } from "@/lib/logger";

// ── Helpers ───────────────────────────────────────────────────

export function todayISO(): string {
  const now = new Date();
  const aest = new Date(
    now.toLocaleString("en-US", { timeZone: "Australia/Sydney" }),
  );
  return aest.toISOString().split("T")[0];
}

export function daysAgoISO(days: number): string {
  const now = new Date();
  const aest = new Date(
    now.toLocaleString("en-US", { timeZone: "Australia/Sydney" }),
  );
  aest.setDate(aest.getDate() - days);
  return aest.toISOString().split("T")[0];
}

/** Parse OWNA dob string to Date or null. */
function parseDob(dob: string | null): Date | null {
  if (!dob) return null;
  const d = new Date(dob);
  return isNaN(d.getTime()) ? null : d;
}

/** Parse OWNA incidentDate "YYYY-MM-DD HH:mm AM/PM" to Date. */
function parseIncidentDate(raw: string): Date {
  // Try direct parse first
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  // Fallback: manual parse "2026-03-15 02:30 PM"
  const match = raw.match(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
  );
  if (match) {
    const [, datePart, hourStr, minStr, ampm] = match;
    let hour = parseInt(hourStr, 10);
    const min = parseInt(minStr, 10);
    if (ampm.toUpperCase() === "PM" && hour !== 12) hour += 12;
    if (ampm.toUpperCase() === "AM" && hour === 12) hour = 0;
    return new Date(`${datePart}T${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}:00`);
  }
  // Last resort — return now
  return new Date();
}

/**
 * Determine OSHC session type from sessionOfCare "HH:mm-HH:mm".
 * Before 9am start → BSC, after 3pm (15:00) start → ASC, else VC.
 */
function sessionTypeFromTime(sessionOfCare: string): SessionType {
  const startTime = sessionOfCare.split("-")[0]?.trim();
  if (startTime) {
    const hour = parseInt(startTime.split(":")[0], 10);
    if (!isNaN(hour)) {
      if (hour < 9) return "bsc";
      if (hour >= 15) return "asc";
    }
  }
  return "vc";
}

/** Map OWNA enquiry status string to our stage enum. */
function mapEnquiryStage(status: string | null): string {
  if (!status || status.trim() === "") return "new_enquiry";
  const lower = status.toLowerCase().trim();
  if (lower === "tour booked" || lower === "tour completed") return "nurturing";
  if (lower === "enrolled") return "enrolled";
  if (lower === "waitlisted" || lower === "waitlist") return "waitlisted";
  return "new_enquiry";
}

/** Map OWNA incident fields to an incident type. */
function mapIncidentType(incident: OwnaIncident): string {
  if (incident.missing && incident.missing.trim()) return "missing_child";
  if (incident.illness && incident.illness.trim()) return "illness";
  if (incident.injurytrauma && incident.injurytrauma.trim()) return "injury";
  return "injury"; // default
}

/** Map OWNA incident to severity. */
function mapSeverity(incident: OwnaIncident): string {
  if (incident.emergencyServices) return "serious";
  if (incident.medicalAttention) return "moderate";
  return "minor";
}

/** Build booking prefs JSON from OWNA child. */
function buildBookingPrefs(child: OwnaChild) {
  return {
    monday: child.monday,
    tuesday: child.tuesday,
    wednesday: child.wednesday,
    thursday: child.thursday,
    friday: child.friday,
    saturday: child.saturday,
    sunday: child.sunday,
    mondayAlt: child.mondayAlt,
    tuesdayAlt: child.tuesdayAlt,
    wednesdayAlt: child.wednesdayAlt,
    thursdayAlt: child.thursdayAlt,
    fridayAlt: child.fridayAlt,
    saturdayAlt: child.saturdayAlt,
    sundayAlt: child.sundayAlt,
  };
}

/** Build address JSON from OWNA child. */
function buildAddress(child: OwnaChild): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!child.streetAddress && !child.suburb && !child.state && !child.postcode) {
    return Prisma.JsonNull;
  }
  return {
    street: child.streetAddress || "",
    suburb: child.suburb || "",
    state: child.state || "",
    postcode: child.postcode || "",
  };
}

/** Build medical JSON from OWNA child. */
function buildMedical(child: OwnaChild) {
  return {
    indigenous: child.indigenous,
    indigenousStatus: child.indigenousStatus,
    disabilities: child.disabilities,
    mainLanguageAtHome: child.mainLanguageAtHome,
  };
}

/** Build description string from incident. */
function buildIncidentDescription(incident: OwnaIncident): string {
  const parts: string[] = [];
  if (incident.injurytrauma) parts.push(incident.injurytrauma);
  if (incident.illness) parts.push(incident.illness);
  if (incident.missing) parts.push(incident.missing);
  if (incident.generalActivity) parts.push(`Activity: ${incident.generalActivity}`);
  if (incident.actionTaken) parts.push(`Action: ${incident.actionTaken}`);
  return parts.join(". ") || "No description provided";
}

// ── Per-service sync results ─────────────────────────────────

export interface ServiceSyncResult {
  children: number;
  attendance: number;
  enquiries: number;
  incidents: number;
  error?: string;
}

// ── Batch size for $transaction arrays ───────────────────────
const BATCH_SIZE = 50;

/** Split array into chunks for batched transactions. */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ── Per-service sync orchestrator ─────────────────────────────

export async function syncOwnaService(
  ownaServiceId: string,
  serviceId: string,
  serviceCode: string,
  owna: NonNullable<ReturnType<() => OwnaClient>>,
): Promise<ServiceSyncResult> {
  const today = todayISO();
  const thirtyDaysAgo = daysAgoISO(30);

  const stats: ServiceSyncResult = {
    children: 0,
    attendance: 0,
    enquiries: 0,
    incidents: 0,
  };
  const errors: string[] = [];

  // ── Children sync (batched upserts) ───────────────────────
  try {
    const children = await owna.getChildren(ownaServiceId);

    if (children.length > 0) {
      const batches = chunk(children, BATCH_SIZE);
      for (const batch of batches) {
        await prisma.$transaction(
          batch.map((child) =>
            prisma.child.upsert({
              where: { ownaChildId: child.id },
              update: {
                firstName: child.firstname,
                surname: child.surname,
                dob: parseDob(child.dob),
                gender: child.gender || null,
                crn: child.crn || null,
                ownaRoomId: child.roomId || null,
                ownaRoomName: child.room || null,
                bookingPrefs: buildBookingPrefs(child),
                address: buildAddress(child),
                medical: buildMedical(child),
                status: child.attending ? "active" : "withdrawn",
                serviceId,
                ownaSyncedAt: new Date(),
              },
              create: {
                ownaChildId: child.id,
                firstName: child.firstname,
                surname: child.surname,
                dob: parseDob(child.dob),
                gender: child.gender || null,
                crn: child.crn || null,
                ownaRoomId: child.roomId || null,
                ownaRoomName: child.room || null,
                bookingPrefs: buildBookingPrefs(child),
                address: buildAddress(child),
                medical: buildMedical(child),
                status: child.attending ? "active" : "withdrawn",
                serviceId,
                ownaSyncedAt: new Date(),
              },
            })
          )
        );
      }
      stats.children = children.length;
    }

    logger.info("OWNA children sync complete", { serviceCode, count: stats.children });
  } catch (err) {
    const msg = `children: ${err instanceof Error ? err.message : String(err)}`;
    logger.error("OWNA children sync failed", { serviceCode, err });
    errors.push(msg);
  }

  // ── Attendance sync (batched upserts) ─────────────────────
  try {
    const records = await owna.getAttendance(ownaServiceId, today, today);

    if (records.length > 0) {
      // Group by date + session type
      const groups = new Map<
        string,
        { attended: number; absent: number; total: number; sessionType: SessionType }
      >();

      for (const rec of records) {
        const sessionType = sessionTypeFromTime(rec.sessionOfCare);
        const key = `${rec.attendanceDate}_${sessionType}`;

        const group = groups.get(key) || {
          attended: 0,
          absent: 0,
          total: 0,
          sessionType,
        };

        group.total += 1;
        if (rec.attending) {
          group.attended += 1;
        } else {
          group.absent += 1;
        }

        groups.set(key, group);
      }

      // Batch upsert aggregated records
      const entries = Array.from(groups.entries());
      const batches = chunk(entries, BATCH_SIZE);
      for (const batch of batches) {
        await prisma.$transaction(
          batch.map(([key, group]) => {
            const dateStr = key.split("_")[0];
            return prisma.dailyAttendance.upsert({
              where: {
                serviceId_date_sessionType: {
                  serviceId,
                  date: new Date(`${dateStr}T00:00:00Z`),
                  sessionType: group.sessionType,
                },
              },
              update: {
                attended: group.attended,
                absent: group.absent,
                enrolled: group.total,
              },
              create: {
                serviceId,
                date: new Date(`${dateStr}T00:00:00Z`),
                sessionType: group.sessionType,
                attended: group.attended,
                absent: group.absent,
                enrolled: group.total,
              },
            });
          })
        );
      }

      stats.attendance = records.length;
    }

    logger.info("OWNA attendance sync complete", { serviceCode, count: stats.attendance });
  } catch (err) {
    const msg = `attendance: ${err instanceof Error ? err.message : String(err)}`;
    logger.error("OWNA attendance sync failed", { serviceCode, err });
    errors.push(msg);
  }

  // ── Enquiry sync (bulk pre-fetch + batched writes) ────────
  try {
    const enquiries = await owna.getEnquiries(ownaServiceId);
    const activeEnquiries = enquiries.filter((e) => !e.archived);

    if (activeEnquiries.length > 0) {
      // Pre-fetch all existing enquiries in one query
      const ownaIds = activeEnquiries.map((e) => e.id);
      const existingEnquiries = await prisma.parentEnquiry.findMany({
        where: { ownaEnquiryId: { in: ownaIds } },
        select: { id: true, ownaEnquiryId: true, stage: true, stageChangedAt: true, createdAt: true },
      });
      const existingMap = new Map(
        existingEnquiries.map((e) => [e.ownaEnquiryId, e])
      );

      // Separate into creates and updates
      const creates: Prisma.ParentEnquiryCreateManyInput[] = [];
      const updates: Prisma.PrismaPromise<unknown>[] = [];

      for (const enq of activeEnquiries) {
        const parentName = [enq.firstname, enq.surname].filter(Boolean).join(" ").trim() || "Unknown";
        const stage = mapEnquiryStage(enq.status);
        const existing = existingMap.get(enq.id);

        if (existing) {
          // Only update if the stage hasn't been manually changed
          const wasManuallyModified =
            existing.stageChangedAt.getTime() - existing.createdAt.getTime() > 60_000;

          if (!wasManuallyModified) {
            updates.push(
              prisma.parentEnquiry.update({
                where: { ownaEnquiryId: enq.id },
                data: {
                  parentName,
                  parentEmail: enq.email || null,
                  parentPhone: enq.phone || null,
                  childName: enq.child1 || null,
                  stage,
                  notes: enq.notes || enq.enquiry || null,
                },
              })
            );
          }
        } else {
          const childrenDetails: Prisma.InputJsonValue | undefined =
            enq.child2
              ? [
                  { name: enq.child1, dob: enq.child1Dob || null },
                  { name: enq.child2, dob: enq.child2Dob || null },
                ]
              : undefined;

          creates.push({
            ownaEnquiryId: enq.id,
            serviceId,
            parentName,
            parentEmail: enq.email || null,
            parentPhone: enq.phone || null,
            childName: enq.child1 || null,
            childrenDetails,
            channel: "website",
            stage,
            notes: enq.notes || enq.enquiry || null,
          });
        }
      }

      // Batch creates
      if (creates.length > 0) {
        await prisma.parentEnquiry.createMany({
          data: creates,
          skipDuplicates: true,
        });
      }

      // Batch updates in transaction chunks
      if (updates.length > 0) {
        const updateBatches = chunk(updates, BATCH_SIZE);
        for (const batch of updateBatches) {
          await prisma.$transaction(batch);
        }
      }

      stats.enquiries = activeEnquiries.length;
    }

    logger.info("OWNA enquiry sync complete", { serviceCode, count: stats.enquiries });
  } catch (err) {
    const msg = `enquiries: ${err instanceof Error ? err.message : String(err)}`;
    logger.error("OWNA enquiry sync failed", { serviceCode, err });
    errors.push(msg);
  }

  // ── Incidents sync (bulk pre-fetch + batched writes) ──────
  try {
    const incidents = await owna.getIncidents(ownaServiceId, thirtyDaysAgo, today);

    if (incidents.length > 0) {
      // Pre-fetch all existing incidents in one query
      const ownaIncIds = incidents.map((i) => i.id);
      const existingIncidents = await prisma.incidentRecord.findMany({
        where: { ownaIncidentId: { in: ownaIncIds } },
        select: { id: true, ownaIncidentId: true },
      });
      const existingIncMap = new Map(
        existingIncidents.map((i) => [i.ownaIncidentId, i.id])
      );

      const creates: Prisma.IncidentRecordCreateManyInput[] = [];
      const updates: Prisma.PrismaPromise<unknown>[] = [];

      for (const inc of incidents) {
        const incidentDate = parseIncidentDate(inc.incidentDate);
        const incidentType = mapIncidentType(inc);
        const severity = mapSeverity(inc);
        const description = buildIncidentDescription(inc);
        const parentNotified = !!inc.parentNotifiedDatetime;
        const existingId = existingIncMap.get(inc.id);

        if (existingId) {
          updates.push(
            prisma.incidentRecord.update({
              where: { id: existingId },
              data: {
                incidentDate,
                childName: inc.child || null,
                incidentType,
                severity,
                location: inc.location || null,
                description,
                actionTaken: inc.actionTaken || null,
                parentNotified,
                reportableToAuthority: inc.emergencyServices,
              },
            })
          );
        } else {
          creates.push({
            ownaIncidentId: inc.id,
            serviceId,
            incidentDate,
            childName: inc.child || null,
            incidentType,
            severity,
            location: inc.location || null,
            description,
            actionTaken: inc.actionTaken || null,
            parentNotified,
            reportableToAuthority: inc.emergencyServices,
          });
        }
      }

      // Batch creates
      if (creates.length > 0) {
        await prisma.incidentRecord.createMany({
          data: creates,
          skipDuplicates: true,
        });
      }

      // Batch updates in transaction chunks
      if (updates.length > 0) {
        const updateBatches = chunk(updates, BATCH_SIZE);
        for (const batch of updateBatches) {
          await prisma.$transaction(batch);
        }
      }

      stats.incidents = incidents.length;
    }

    logger.info("OWNA incidents sync complete", { serviceCode, count: stats.incidents });
  } catch (err) {
    const msg = `incidents: ${err instanceof Error ? err.message : String(err)}`;
    logger.error("OWNA incidents sync failed", { serviceCode, err });
    errors.push(msg);
  }

  // ── Update last sync timestamp ────────────────────────────
  try {
    await prisma.service.update({
      where: { id: serviceId },
      data: { ownaSyncedAt: new Date() },
    });
  } catch (err) {
    logger.error("OWNA failed to update ownaSyncedAt", { serviceCode, err });
  }

  if (errors.length > 0) {
    stats.error = errors.join("; ");
  }

  return stats;
}

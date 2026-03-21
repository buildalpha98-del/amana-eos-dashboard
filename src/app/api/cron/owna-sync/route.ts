import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { getOwnaClient } from "@/lib/owna";
import type { OwnaChild, OwnaIncident } from "@/lib/owna";
import type { SessionType } from "@prisma/client";

// ── Helpers ───────────────────────────────────────────────────

function todayISO(): string {
  const now = new Date();
  const aest = new Date(
    now.toLocaleString("en-US", { timeZone: "Australia/Sydney" }),
  );
  return aest.toISOString().split("T")[0];
}

function daysAgoISO(days: number): string {
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
function mapEnquiryStage(
  status: string | null,
): string {
  if (!status || status.trim() === "") return "new_enquiry";
  const lower = status.toLowerCase().trim();
  if (lower === "tour booked" || lower === "tour completed") return "nurturing";
  if (lower === "enrolled") return "enrolled";
  if (lower === "waitlisted" || lower === "waitlist") return "info_sent";
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

interface ServiceSyncResult {
  children: number;
  attendance: number;
  enquiries: number;
  incidents: number;
  error?: string;
}

// ── Cron Handler ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // 1. Auth
  const authCheck = verifyCronSecret(req);
  if (authCheck) return authCheck.error;

  // 2. Idempotency lock — use a half-hourly period key
  const now = new Date();
  const halfHourSlot = `${now.toISOString().split("T")[0]}-${now.getUTCHours().toString().padStart(2, "0")}${now.getUTCMinutes() < 30 ? "00" : "30"}`;

  const guard = await acquireCronLock(`owna-sync-${halfHourSlot}`, "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  // 3. Check OWNA client is configured
  const owna = getOwnaClient();
  if (!owna) {
    await guard.complete({ skipped: true, reason: "OWNA not configured" });
    return NextResponse.json({
      message: "OWNA API not configured — skipping sync",
      skipped: true,
    });
  }

  // 4. Fetch all services with OWNA mapping
  const services = await prisma.service.findMany({
    where: {
      status: "active",
      ownaServiceId: { not: null },
    },
    select: {
      id: true,
      code: true,
      ownaServiceId: true,
    },
  });

  if (services.length === 0) {
    await guard.complete({ skipped: true, reason: "No services mapped" });
    return NextResponse.json({
      message: "No services with OWNA mapping — skipping",
      skipped: true,
    });
  }

  const today = todayISO();
  const thirtyDaysAgo = daysAgoISO(30);
  const results: Record<string, ServiceSyncResult> = {};

  // 5. Sync each service
  for (const svc of services) {
    const ownaServiceId = svc.ownaServiceId!;
    const stats: ServiceSyncResult = {
      children: 0,
      attendance: 0,
      enquiries: 0,
      incidents: 0,
    };
    const errors: string[] = [];

    // ── Children sync ───────────────────────────────────────
    try {
      const children = await owna.getChildren(ownaServiceId);

      if (children.length > 0) {
        for (const child of children) {
          await prisma.child.upsert({
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
              serviceId: svc.id,
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
              serviceId: svc.id,
              ownaSyncedAt: new Date(),
            },
          });
        }
        stats.children = children.length;
      }

      console.log(`[OWNA] Children sync for ${svc.code}: ${stats.children} upserted`);
    } catch (err) {
      const msg = `children: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[OWNA] Children sync failed for ${svc.code}:`, err);
      errors.push(msg);
    }

    // ── Attendance sync ─────────────────────────────────────
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

        // Upsert aggregated records
        for (const [key, group] of groups) {
          const dateStr = key.split("_")[0];
          await prisma.dailyAttendance.upsert({
            where: {
              serviceId_date_sessionType: {
                serviceId: svc.id,
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
              serviceId: svc.id,
              date: new Date(`${dateStr}T00:00:00Z`),
              sessionType: group.sessionType,
              attended: group.attended,
              absent: group.absent,
              enrolled: group.total,
            },
          });
        }

        stats.attendance = records.length;
      }

      console.log(`[OWNA] Attendance sync for ${svc.code}: ${stats.attendance} records processed`);
    } catch (err) {
      const msg = `attendance: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[OWNA] Attendance sync failed for ${svc.code}:`, err);
      errors.push(msg);
    }

    // ── Enquiry sync ────────────────────────────────────────
    try {
      const enquiries = await owna.getEnquiries(ownaServiceId);

      if (enquiries.length > 0) {
        for (const enq of enquiries) {
          // Skip archived enquiries
          if (enq.archived) continue;

          const parentName = [enq.firstname, enq.surname].filter(Boolean).join(" ").trim() || "Unknown";
          const stage = mapEnquiryStage(enq.status);

          // Check if record exists and was manually modified
          const existing = await prisma.parentEnquiry.findUnique({
            where: { ownaEnquiryId: enq.id },
            select: { id: true, stage: true, stageChangedAt: true, createdAt: true },
          });

          if (existing) {
            // Only update if the stage hasn't been manually changed
            // (i.e. stageChangedAt is still close to createdAt — within 1 minute)
            const wasManuallyModified =
              existing.stageChangedAt.getTime() - existing.createdAt.getTime() > 60_000;

            if (!wasManuallyModified) {
              await prisma.parentEnquiry.update({
                where: { ownaEnquiryId: enq.id },
                data: {
                  parentName,
                  parentEmail: enq.email || null,
                  parentPhone: enq.phone || null,
                  childName: enq.child1 || null,
                  stage,
                  notes: enq.notes || enq.enquiry || null,
                },
              });
            }
          } else {
            // Build children details if child2 exists
            const childrenDetails: Prisma.InputJsonValue | undefined =
              enq.child2
                ? [
                    { name: enq.child1, dob: enq.child1Dob || null },
                    { name: enq.child2, dob: enq.child2Dob || null },
                  ]
                : undefined;

            await prisma.parentEnquiry.create({
              data: {
                ownaEnquiryId: enq.id,
                serviceId: svc.id,
                parentName,
                parentEmail: enq.email || null,
                parentPhone: enq.phone || null,
                childName: enq.child1 || null,
                childrenDetails,
                channel: "website",
                stage,
                notes: enq.notes || enq.enquiry || null,
              },
            });
          }
        }
        stats.enquiries = enquiries.filter((e) => !e.archived).length;
      }

      console.log(`[OWNA] Enquiry sync for ${svc.code}: ${stats.enquiries} processed`);
    } catch (err) {
      const msg = `enquiries: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[OWNA] Enquiry sync failed for ${svc.code}:`, err);
      errors.push(msg);
    }

    // ── Incidents sync ──────────────────────────────────────
    try {
      const incidents = await owna.getIncidents(ownaServiceId, thirtyDaysAgo, today);

      if (incidents.length > 0) {
        for (const inc of incidents) {
          const incidentDate = parseIncidentDate(inc.incidentDate);
          const incidentType = mapIncidentType(inc);
          const severity = mapSeverity(inc);
          const description = buildIncidentDescription(inc);
          const parentNotified = !!inc.parentNotifiedDatetime;

          // Check if already exists
          const existing = await prisma.incidentRecord.findFirst({
            where: { ownaIncidentId: inc.id },
            select: { id: true },
          });

          if (existing) {
            await prisma.incidentRecord.update({
              where: { id: existing.id },
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
            });
          } else {
            await prisma.incidentRecord.create({
              data: {
                ownaIncidentId: inc.id,
                serviceId: svc.id,
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
            });
          }
        }
        stats.incidents = incidents.length;
      }

      console.log(`[OWNA] Incidents sync for ${svc.code}: ${stats.incidents} upserted`);
    } catch (err) {
      const msg = `incidents: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[OWNA] Incidents sync failed for ${svc.code}:`, err);
      errors.push(msg);
    }

    // ── Update last sync timestamp ────────────────────────
    try {
      await prisma.service.update({
        where: { id: svc.id },
        data: { ownaSyncedAt: new Date() },
      });
    } catch (err) {
      console.error(`[OWNA] Failed to update ownaSyncedAt for ${svc.code}:`, err);
    }

    if (errors.length > 0) {
      stats.error = errors.join("; ");
    }

    results[svc.code] = stats;
  }

  await guard.complete({
    servicesProcessed: services.length,
    results,
  });

  return NextResponse.json({
    message: "OWNA sync completed",
    date: today,
    servicesProcessed: services.length,
    results,
  });
}

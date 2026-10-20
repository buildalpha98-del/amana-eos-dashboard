import type { Prisma, PrismaClient, TriageSubjectType } from "@prisma/client";
import type { TriageSubject } from "@/lib/knox/types";

type Db = PrismaClient | Prisma.TransactionClient;

const SERVICE_SELECT = { id: true, name: true, state: true, managerId: true } as const;

/**
 * First whitespace token of a child's name, or null. The model redactor
 * (`redactForModel`) trusts this to hold the first name ONLY, so a surname
 * must never get through here.
 */
function firstToken(name: string | null): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}

/**
 * Load an incident-register record and its service for Knox. Returns null
 * when the row is missing or (incidents only) soft-deleted.
 */
export async function loadSubject(
  db: Db,
  subjectType: TriageSubjectType,
  subjectId: string,
): Promise<TriageSubject | null> {
  switch (subjectType) {
    case "incident": {
      const row = await db.incidentRecord.findUnique({
        where: { id: subjectId },
        include: { service: { select: SERVICE_SELECT } },
      });
      if (!row || row.deleted) return null;
      const { service, ...record } = row;
      return { type: "incident", record, service, childFirstName: firstToken(row.childName) };
    }
    case "complaint": {
      const row = await db.complaintRecord.findUnique({
        where: { id: subjectId },
        include: { service: { select: SERVICE_SELECT } },
      });
      if (!row) return null;
      const { service, ...record } = row;
      return { type: "complaint", record, service };
    }
    case "staff_incident": {
      const row = await db.staffIncidentReport.findUnique({
        where: { id: subjectId },
        include: { service: { select: SERVICE_SELECT } },
      });
      if (!row) return null;
      const { service, ...record } = row;
      return { type: "staff_incident", record, service };
    }
  }
}

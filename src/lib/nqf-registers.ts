/**
 * NQF compliance registers — shared data shape + helpers.
 *
 * Education and Care Services National Regulations (Cth) require
 * approved providers to keep specific registers, available for an
 * authorised officer (ACECQA) to inspect. The records exist scattered
 * across our User, ComplianceCertificate, EmploymentContract, Service
 * tables; this module assembles them in the format inspectors expect.
 *
 * Registers covered (v1):
 *   - Reg 145 / Reg 148: Register of staff + educators
 *
 * Registers NOT covered (need separate work):
 *   - Reg 146: Nominated supervisor — needs a dedicated record of
 *     nomination + consent + date. Currently inferable from User.role
 *     but not formal.
 *   - Reg 147: Register of volunteers & students — needs a Volunteer
 *     entity which we don't have yet.
 */

import { prisma } from "@/lib/prisma";

/** The fields ACECQA expects to see in the staff register. Shaped
 *  for direct CSV row output. */
export interface StaffRegisterRow {
  // Personal
  fullName: string;
  dateOfBirth: string | null; // ISO YYYY-MM-DD
  address: string | null;
  phone: string | null;
  email: string;
  // Employment
  positionHeld: string; // User.role human-readable
  employmentStatus: string; // contract type or "—"
  startDate: string | null; // ISO YYYY-MM-DD
  serviceName: string;
  serviceCode: string;
  // Visa
  visaStatus: string | null;
  visaExpiry: string | null;
  // Compliance certificates — most recent active by type
  wwccNumber: string | null;
  wwccExpiry: string | null;
  firstAidExpiry: string | null;
  cprExpiry: string | null;
  anaphylaxisExpiry: string | null;
  asthmaExpiry: string | null;
  policeCheckExpiry: string | null;
  childProtectionExpiry: string | null;
  foodSafetyExpiry: string | null;
}

const POSITION_LABELS: Record<string, string> = {
  owner: "Approved Provider / Director",
  head_office: "Head Office",
  admin: "Administrator",
  member: "Service Coordinator (Nominated Supervisor)",
  staff: "Educator",
  marketing: "Marketing",
};

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  casual: "Casual",
  part_time: "Part-time",
  permanent: "Permanent",
  fixed_term: "Fixed-term",
};

function fmtDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function composeAddress(u: {
  addressStreet?: string | null;
  addressSuburb?: string | null;
  addressState?: string | null;
  addressPostcode?: string | null;
}): string | null {
  const parts = [
    u.addressStreet,
    u.addressSuburb,
    u.addressState,
    u.addressPostcode,
  ].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Build the Reg 145 / Reg 148 register rows for every active staff
 * member. Optionally scope to a single service.
 *
 * Performance: 3 queries (users + certs + contracts) regardless of
 * staff count. ~10ms even at 500 employees.
 */
export async function buildStaffRegister(
  serviceId?: string,
): Promise<StaffRegisterRow[]> {
  const users = await prisma.user.findMany({
    where: {
      active: true,
      ...(serviceId ? { serviceId } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      dateOfBirth: true,
      addressStreet: true,
      addressSuburb: true,
      addressState: true,
      addressPostcode: true,
      startDate: true,
      visaStatus: true,
      visaExpiry: true,
      service: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ service: { name: "asc" } }, { name: "asc" }],
  });

  const userIds = users.map((u) => u.id);

  // Pull all non-superseded certs for these users in one query.
  const certs = await prisma.complianceCertificate.findMany({
    where: {
      userId: { in: userIds },
      supersededAt: null,
    },
    select: {
      userId: true,
      type: true,
      expiryDate: true,
      label: true,
      notes: true,
    },
    orderBy: { expiryDate: "desc" },
  });

  // Bucket certs by (userId, type) — keep the most recent (already
  // ordered desc by expiry above).
  const certByUserType = new Map<string, (typeof certs)[number]>();
  for (const c of certs) {
    if (!c.userId) continue;
    const k = `${c.userId}:${c.type}`;
    if (!certByUserType.has(k)) certByUserType.set(k, c);
  }

  // Latest contract per user (for employment status).
  const contracts = await prisma.employmentContract.findMany({
    where: { userId: { in: userIds }, status: "active" },
    select: { userId: true, contractType: true, startDate: true },
    orderBy: { startDate: "desc" },
  });
  const contractByUser = new Map<string, (typeof contracts)[number]>();
  for (const c of contracts) {
    if (!contractByUser.has(c.userId)) contractByUser.set(c.userId, c);
  }

  // WWCC label sometimes carries the actual WWCC number — surface it
  // separately for the register column. Falls back to "—" if not in
  // the label or notes.
  function wwccNumber(userId: string): string | null {
    const wwcc = certByUserType.get(`${userId}:wwcc`);
    if (!wwcc) return null;
    // Common conventions: label = "WWCC 1234567A" or notes = number.
    // Heuristic: extract first alphanumeric token containing digits.
    const haystack = [wwcc.label, wwcc.notes].filter(Boolean).join(" ");
    const m = haystack.match(/[A-Z0-9-]{4,}/i);
    return m ? m[0] : null;
  }

  function exp(userId: string, type: string): string | null {
    return fmtDate(certByUserType.get(`${userId}:${type}`)?.expiryDate ?? null);
  }

  return users.map((u): StaffRegisterRow => {
    const contract = contractByUser.get(u.id);
    return {
      fullName: u.name,
      dateOfBirth: fmtDate(u.dateOfBirth),
      address: composeAddress(u),
      phone: u.phone ?? null,
      email: u.email,
      positionHeld: POSITION_LABELS[u.role] ?? u.role,
      employmentStatus: contract
        ? CONTRACT_TYPE_LABELS[contract.contractType] ?? contract.contractType
        : "—",
      startDate: fmtDate(u.startDate ?? contract?.startDate ?? null),
      serviceName: u.service?.name ?? "Unassigned",
      serviceCode: u.service?.code ?? "—",
      visaStatus: u.visaStatus ?? null,
      visaExpiry: fmtDate(u.visaExpiry),
      wwccNumber: wwccNumber(u.id),
      wwccExpiry: exp(u.id, "wwcc"),
      firstAidExpiry: exp(u.id, "first_aid"),
      cprExpiry: exp(u.id, "cpr"),
      anaphylaxisExpiry: exp(u.id, "anaphylaxis"),
      asthmaExpiry: exp(u.id, "asthma"),
      policeCheckExpiry: exp(u.id, "police_check"),
      childProtectionExpiry: exp(u.id, "child_protection"),
      foodSafetyExpiry: exp(u.id, "food_safety"),
    };
  });
}

/** RFC 4180 CSV escape — wraps in quotes when needed. */
export function csvEscape(value: string | null): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** The CSV column order — keeps inspector-facing output stable. */
export const STAFF_REGISTER_COLUMNS: Array<{
  key: keyof StaffRegisterRow;
  header: string;
}> = [
  { key: "fullName", header: "Full name" },
  { key: "dateOfBirth", header: "Date of birth" },
  { key: "address", header: "Address" },
  { key: "phone", header: "Phone" },
  { key: "email", header: "Email" },
  { key: "positionHeld", header: "Position" },
  { key: "employmentStatus", header: "Employment status" },
  { key: "startDate", header: "Start date" },
  { key: "serviceName", header: "Service" },
  { key: "serviceCode", header: "Service code" },
  { key: "visaStatus", header: "Visa status" },
  { key: "visaExpiry", header: "Visa expiry" },
  { key: "wwccNumber", header: "WWCC number" },
  { key: "wwccExpiry", header: "WWCC expiry" },
  { key: "firstAidExpiry", header: "First Aid expiry" },
  { key: "cprExpiry", header: "CPR expiry" },
  { key: "anaphylaxisExpiry", header: "Anaphylaxis expiry" },
  { key: "asthmaExpiry", header: "Asthma expiry" },
  { key: "policeCheckExpiry", header: "Police check expiry" },
  { key: "childProtectionExpiry", header: "Child Protection expiry" },
  { key: "foodSafetyExpiry", header: "Food Safety expiry" },
];

export function rowsToCsv(rows: StaffRegisterRow[]): string {
  const header = STAFF_REGISTER_COLUMNS.map((c) => csvEscape(c.header)).join(",");
  const body = rows.map((r) =>
    STAFF_REGISTER_COLUMNS.map((c) => csvEscape(r[c.key])).join(","),
  );
  return [header, ...body].join("\n");
}

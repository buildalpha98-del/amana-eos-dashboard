/**
 * WGEA workforce-composition report builder.
 *
 * The Workplace Gender Equality Agency requires non-public-sector
 * employers with 100+ employees to lodge an annual workforce-
 * composition report. We're not at the threshold yet, but generating
 * the report now serves three purposes:
 *
 *   1. Internal workforce planning ("where are the gaps?")
 *   2. WGEA-prep — when we cross the threshold we already have the
 *      data shape locked in
 *   3. Evidence of good-faith inclusion practice for board reporting
 *
 * Source data:
 *   - User (role, contract type, start date)
 *   - EmploymentContract (latest active — type, payRate, hoursPerWeek)
 *   - DiversityProfile (gender, indigenous, born-in-Aus, language)
 *
 * Gender uses the disclosed value from DiversityProfile where
 * available; otherwise "undisclosed". We do NOT fall back to a
 * "presumed gender" — that would defeat the point of self-disclosure.
 *
 * Anonymisation: the builder takes `anonymise: boolean`. When true,
 * `staffId` is a deterministic hash + the name is omitted. Default true
 * so an accidental download doesn't leak identifying detail.
 */

import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";

// WGEA manager categories (simplified — we don't have CEO/KMP
// distinctions modelled, so we collapse to: key management / manager /
// non-manager based on the Role enum).
export type WgeaManagerCategory =
  | "key_management"
  | "other_manager"
  | "non_manager";

// WGEA employment categories.
export type WgeaEmploymentType =
  | "full_time_permanent"
  | "full_time_fixed_term"
  | "part_time_permanent"
  | "part_time_fixed_term"
  | "casual"
  | "unknown";

export type WgeaGender = "woman" | "man" | "non_binary" | "undisclosed";

export interface WgeaRow {
  staffId: string;
  name: string | null;
  managerCategory: WgeaManagerCategory;
  employmentType: WgeaEmploymentType;
  gender: WgeaGender;
  annualisedBaseSalary: number | null;
  tenureYears: number | null;
  carerResponsibilities: string;
  indigenous: string;
  bornOutsideAustralia: string;
  languageAtHome: string;
  serviceName: string;
  startDate: string | null;
}

// ── Mapping helpers ────────────────────────────────────────────────

function mapRoleToManagerCategory(role: string): WgeaManagerCategory {
  // Crude: owner = key management; head_office + admin = other manager;
  // member (Director of Service) = other manager; staff/marketing =
  // non-manager. Not perfect but consistent.
  if (role === "owner") return "key_management";
  if (role === "head_office" || role === "admin" || role === "member") {
    return "other_manager";
  }
  return "non_manager";
}

function mapContractTypeToEmployment(
  type: string | null | undefined,
  hoursPerWeek: number | null | undefined,
): WgeaEmploymentType {
  if (!type) return "unknown";
  const isFullTime = hoursPerWeek != null && hoursPerWeek >= 30;
  // ContractType enum: ct_casual / ct_part_time / ct_permanent /
  // ct_fixed_term per prisma/schema.prisma.
  switch (type) {
    case "ct_casual":
      return "casual";
    case "ct_part_time":
      // Permanent part-time is the typical OSHC educator pattern.
      return "part_time_permanent";
    case "ct_permanent":
      return isFullTime ? "full_time_permanent" : "part_time_permanent";
    case "ct_fixed_term":
      return isFullTime ? "full_time_fixed_term" : "part_time_fixed_term";
    default:
      return "unknown";
  }
}

function mapDiversityGender(
  g: string | null | undefined,
): WgeaGender {
  switch (g) {
    case "woman":
      return "woman";
    case "man":
      return "man";
    case "non_binary":
    case "prefer_to_self_describe":
      return "non_binary";
    default:
      return "undisclosed";
  }
}

function calculateTenureYears(startDate: Date | null): number | null {
  if (!startDate) return null;
  const ms = Date.now() - new Date(startDate).getTime();
  return Math.round((ms / (1000 * 60 * 60 * 24 * 365.25)) * 10) / 10;
}

// Stable opaque hash so anonymised rows are still join-able year over
// year (same staffId in next year's report = same person). NOT keyed
// by salt — this is a workforce report, not a security artefact.
function hashId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

// ── Main builder ─────────────────────────────────────────────────────

export interface BuildOptions {
  /** Filter to one service. */
  serviceId?: string;
  /** Anonymise staff identity (default true). */
  anonymise?: boolean;
  /** Only include active staff (default true). */
  activeOnly?: boolean;
}

export async function buildWgeaReport(
  opts: BuildOptions = {},
): Promise<WgeaRow[]> {
  const { serviceId, anonymise = true, activeOnly = true } = opts;

  const users = await prisma.user.findMany({
    where: {
      ...(activeOnly ? { active: true } : {}),
      ...(serviceId ? { serviceId } : {}),
    },
    select: {
      id: true,
      name: true,
      role: true,
      startDate: true,
      service: { select: { name: true } },
      diversityProfile: {
        select: {
          genderIdentity: true,
          carerStatus: true,
          indigenousIdentity: true,
          bornInAustralia: true,
          languageAtHome: true,
        },
      },
      contracts: {
        where: { status: "active" },
        select: { contractType: true, payRate: true, hoursPerWeek: true },
        orderBy: { startDate: "desc" },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  return users.map<WgeaRow>((u) => {
    const c = u.contracts[0] ?? null;
    const employmentType = mapContractTypeToEmployment(
      c?.contractType,
      c?.hoursPerWeek ?? null,
    );

    // Annualised base salary — payRate × hours per week × 52. Casuals
    // get null (no annualisation possible from hourly rate alone).
    let annualised: number | null = null;
    if (
      c &&
      c.payRate &&
      c.hoursPerWeek != null &&
      employmentType !== "casual"
    ) {
      annualised = Math.round(Number(c.payRate) * c.hoursPerWeek * 52);
    }

    const dp = u.diversityProfile;

    return {
      staffId: anonymise ? hashId(u.id) : u.id,
      name: anonymise ? null : u.name,
      managerCategory: mapRoleToManagerCategory(u.role),
      employmentType,
      gender: mapDiversityGender(dp?.genderIdentity ?? null),
      annualisedBaseSalary: annualised,
      tenureYears: calculateTenureYears(u.startDate),
      carerResponsibilities: dp?.carerStatus ?? "undisclosed",
      indigenous: dp?.indigenousIdentity ?? "undisclosed",
      bornOutsideAustralia:
        dp?.bornInAustralia === true
          ? "no"
          : dp?.bornInAustralia === false
            ? "yes"
            : "undisclosed",
      languageAtHome: dp?.languageAtHome ?? "",
      serviceName: u.service?.name ?? "",
      startDate: u.startDate
        ? new Date(u.startDate).toISOString().slice(0, 10)
        : null,
    };
  });
}

// ── CSV serialisation ───────────────────────────────────────────────

const COLUMNS: Array<{ key: keyof WgeaRow; header: string }> = [
  { key: "staffId", header: "Staff ID" },
  { key: "name", header: "Name" },
  { key: "managerCategory", header: "Manager category" },
  { key: "employmentType", header: "Employment type" },
  { key: "gender", header: "Gender" },
  { key: "annualisedBaseSalary", header: "Annualised base salary (AUD)" },
  { key: "tenureYears", header: "Tenure (years)" },
  { key: "carerResponsibilities", header: "Carer responsibilities" },
  { key: "indigenous", header: "Aboriginal / Torres Strait Islander" },
  { key: "bornOutsideAustralia", header: "Born outside Australia" },
  { key: "languageAtHome", header: "Language at home" },
  { key: "serviceName", header: "Service" },
  { key: "startDate", header: "Start date" },
];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (
    s.includes(",") ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r")
  ) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(rows: WgeaRow[]): string {
  const header = COLUMNS.map((c) => csvEscape(c.header)).join(",");
  const body = rows.map((r) =>
    COLUMNS.map((c) => csvEscape(r[c.key])).join(","),
  );
  return [header, ...body].join("\n");
}

// ── Summary helpers for the on-page preview ─────────────────────────

export interface WgeaSummary {
  total: number;
  byGender: Record<WgeaGender, number>;
  byEmployment: Record<WgeaEmploymentType, number>;
  byManager: Record<WgeaManagerCategory, number>;
  averageTenureYears: number | null;
}

export function summariseRows(rows: WgeaRow[]): WgeaSummary {
  const byGender: Record<WgeaGender, number> = {
    woman: 0,
    man: 0,
    non_binary: 0,
    undisclosed: 0,
  };
  const byEmployment: Record<WgeaEmploymentType, number> = {
    full_time_permanent: 0,
    full_time_fixed_term: 0,
    part_time_permanent: 0,
    part_time_fixed_term: 0,
    casual: 0,
    unknown: 0,
  };
  const byManager: Record<WgeaManagerCategory, number> = {
    key_management: 0,
    other_manager: 0,
    non_manager: 0,
  };
  let tenureSum = 0;
  let tenureCount = 0;
  for (const r of rows) {
    byGender[r.gender]++;
    byEmployment[r.employmentType]++;
    byManager[r.managerCategory]++;
    if (r.tenureYears != null) {
      tenureSum += r.tenureYears;
      tenureCount++;
    }
  }
  return {
    total: rows.length,
    byGender,
    byEmployment,
    byManager,
    averageTenureYears:
      tenureCount > 0
        ? Math.round((tenureSum / tenureCount) * 10) / 10
        : null,
  };
}

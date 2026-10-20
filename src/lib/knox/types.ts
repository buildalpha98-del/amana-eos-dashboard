import type {
  IncidentRecord,
  ComplaintRecord,
  StaffIncidentReport,
  TriageTier,
} from "@prisma/client";

export interface ServiceLite {
  id: string;
  name: string;
  state: string | null;
  managerId: string | null;
}

export type TriageSubject =
  | { type: "incident"; record: IncidentRecord; service: ServiceLite; childFirstName: string | null }
  | { type: "complaint"; record: ComplaintRecord; service: ServiceLite }
  | { type: "staff_incident"; record: StaffIncidentReport; service: ServiceLite };

export type ClockKind = "parent_24h" | "regulator" | "complaint_regulator";

export interface TriageClock {
  kind: ClockKind;
  /** ISO-8601 instant. */
  dueAt: string;
  /** The provision the deadline comes from, e.g. "Reg 86". */
  basis: string;
  /** `dueAt < now` at evaluation time. */
  overdue: boolean;
}

export interface RulesResult {
  tier: TriageTier;
  ruleHits: string[];
  clocks: TriageClock[];
}

export const TIER_RANK: Record<TriageTier, number> = { minor: 0, moderate: 1, serious: 2 };

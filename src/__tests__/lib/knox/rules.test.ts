import { describe, it, expect } from "vitest";
import type { ComplaintRecord, IncidentRecord, StaffIncidentReport } from "@prisma/client";
import { evaluateRules, REGULATOR_WINDOW_HOURS, regulatorDueAt } from "@/lib/knox/rules";

const NOW = new Date("2026-10-20T03:00:00Z");
const svc = { id: "svc-1", name: "Arkana", state: "NSW", managerId: null };

const incident = (o: Partial<IncidentRecord> = {}) => ({
  type: "incident" as const,
  service: svc,
  childFirstName: "Ali",
  record: {
    id: "i1",
    serviceId: "svc-1",
    incidentDate: new Date("2026-10-20T01:00:00Z"),
    incidentType: "injury",
    severity: "minor",
    ambulanceCalled: false,
    medicalPersonnelContacted: null,
    reportableToAuthority: false,
    seriousIncidentCategory: null,
    parentNotified: false,
    becameAwareAt: null,
    createdAt: NOW,
    deleted: false,
    ...o,
  } as IncidentRecord,
});

const complaint = (o: Partial<ComplaintRecord> = {}) => ({
  type: "complaint" as const,
  service: svc,
  record: {
    id: "c1",
    serviceId: "svc-1",
    category: "fee",
    notifiable: false,
    status: "new",
    becameAwareAt: null,
    notificationDueAt: null,
    regulatorNotifiedAt: null,
    ...o,
  } as ComplaintRecord,
});

const staffIncident = (o: Partial<StaffIncidentReport> = {}) => ({
  type: "staff_incident" as const,
  service: svc,
  record: {
    id: "s1",
    serviceId: "svc-1",
    severity: "minor",
    reportableToAuthority: false,
    ...o,
  } as StaffIncidentReport,
});

describe.each([
  ["ambulance_called", incident({ ambulanceCalled: true }), "serious"],
  ["missing_child", incident({ incidentType: "missing_child" }), "serious"],
  ["stated_serious", incident({ severity: "reportable" }), "serious"],
  ["reportable_flag", incident({ seriousIncidentCategory: "serious_injury" }), "serious"],
  ["medical_contacted", incident({ medicalPersonnelContacted: "GP phoned" }), "moderate"],
  ["medication_error", incident({ incidentType: "medication_error" }), "moderate"],
  ["stated_moderate", incident({ severity: "moderate" }), "moderate"],
])("%s", (rule, subject, tier) => {
  it(`→ ${tier} and records the hit`, () => {
    const r = evaluateRules(subject, NOW);
    expect(r.tier).toBe(tier);
    expect(r.ruleHits).toContain(rule);
  });
});

it("nothing matched → minor with no hits", () => {
  expect(evaluateRules(incident(), NOW)).toMatchObject({ tier: "minor", ruleHits: [] });
});

it("records every hit, not just the first", () => {
  const r = evaluateRules(incident({ ambulanceCalled: true, severity: "moderate" }), NOW);
  expect(r.ruleHits).toEqual(expect.arrayContaining(["ambulance_called", "stated_moderate"]));
  expect(r.tier).toBe("serious");
});

it("complaint: notifiable → serious; child_safety → moderate; status escalated → serious", () => {
  const notifiable = evaluateRules(complaint({ notifiable: true }), NOW);
  expect(notifiable.tier).toBe("serious");
  expect(notifiable.ruleHits).toContain("complaint_notifiable");

  const sensitive = evaluateRules(complaint({ category: "child_safety" }), NOW);
  expect(sensitive.tier).toBe("moderate");
  expect(sensitive.ruleHits).toContain("complaint_sensitive");

  const escalated = evaluateRules(complaint({ status: "escalated" }), NOW);
  expect(escalated.tier).toBe("serious");
  expect(escalated.ruleHits).toContain("complaint_escalated");
});

it("staff_incident: notifiable severity → serious; moderate → moderate; reportable flag → serious", () => {
  const notifiable = evaluateRules(staffIncident({ severity: "notifiable" }), NOW);
  expect(notifiable.tier).toBe("serious");
  expect(notifiable.ruleHits).toContain("staff_notifiable");

  const moderate = evaluateRules(staffIncident({ severity: "moderate" }), NOW);
  expect(moderate.tier).toBe("moderate");
  expect(moderate.ruleHits).toContain("staff_moderate");

  const flagged = evaluateRules(staffIncident({ reportableToAuthority: true }), NOW);
  expect(flagged.tier).toBe("serious");
  expect(flagged.ruleHits).toContain("staff_notifiable");
});

it("parent_24h clock when parentNotified is false, overdue flagged", () => {
  const r = evaluateRules(incident({ incidentDate: new Date("2026-10-18T00:00:00Z") }), NOW);
  expect(r.clocks).toContainEqual({
    kind: "parent_24h",
    dueAt: "2026-10-19T00:00:00.000Z",
    basis: "Reg 86",
    overdue: true,
  });
});

it("no parent clock once parentNotified", () => {
  expect(
    evaluateRules(incident({ parentNotified: true }), NOW).clocks.find((c) => c.kind === "parent_24h"),
  ).toBeUndefined();
});

it("regulator clock: 24h from becameAwareAt, else from createdAt; category drives the window", () => {
  expect(
    regulatorDueAt("serious_injury", new Date("2026-10-20T00:00:00Z"), NOW)?.toISOString(),
  ).toBe("2026-10-21T00:00:00.000Z");
  expect(regulatorDueAt(null, null, NOW)?.toISOString()).toBe("2026-10-21T03:00:00.000Z");
  for (const k of Object.keys(REGULATOR_WINDOW_HOURS)) {
    expect(REGULATOR_WINDOW_HOURS[k as never]).toBeGreaterThan(0);
  }
});

it("emits the regulator clock for a reportable incident", () => {
  const r = evaluateRules(
    incident({
      reportableToAuthority: true,
      seriousIncidentCategory: "serious_injury",
      becameAwareAt: new Date("2026-10-20T00:00:00Z"),
    }),
    NOW,
  );
  expect(r.clocks).toContainEqual({
    kind: "regulator",
    dueAt: "2026-10-21T00:00:00.000Z",
    basis: "Reg 176(2)(a)",
    overdue: false,
  });
});

it("complaint_regulator clock reuses the stamped notificationDueAt", () => {
  const r = evaluateRules(
    complaint({ notifiable: true, notificationDueAt: new Date("2026-10-20T02:00:00Z"), regulatorNotifiedAt: null }),
    NOW,
  );
  expect(r.clocks).toContainEqual({
    kind: "complaint_regulator",
    dueAt: "2026-10-20T02:00:00.000Z",
    basis: "s.174(2)(b)",
    overdue: true,
  });
});

it("no complaint_regulator clock once the regulator has been notified", () => {
  const r = evaluateRules(
    complaint({
      notifiable: true,
      notificationDueAt: new Date("2026-10-20T02:00:00Z"),
      regulatorNotifiedAt: new Date("2026-10-20T01:00:00Z"),
    }),
    NOW,
  );
  expect(r.clocks).toEqual([]);
});

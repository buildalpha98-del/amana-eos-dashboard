import { describe, it, expect } from "vitest";
import {
  applyHandoff,
  handoffPatchSchema,
  handoffSummary,
  placementKey,
  type HandoffState,
  type HandoffPatch, normaliseHandoff } from "@/lib/owna-handoff";
const actor = { id: "u1", name: "Reviewer" };
const state = (): HandoffState => ({
  placement: "p",
  owner: actor,
  note: "",
  steps: {},
});
const patch = (step: HandoffPatch["step"]): HandoffPatch => ({
  revision: 0,
  action: "complete",
  step,
  evidence: "Checked in OWNA 10 October",
  mode: "existing",
});
describe("OWNA manual handoff", () => {
  it("needs no notes to tick, but does need the invitation arrangement", () => {
    expect(
      handoffPatchSchema.safeParse({ revision: 0, action: "complete", step: "children" }).success,
    ).toBe(true);
    expect(
      handoffPatchSchema.safeParse({ ...patch("invitation"), mode: undefined }).success,
    ).toBe(false);
  });
  it("first sessions: a first day OR casual bookings only", () => {
    const base = { revision: 0, action: "complete", step: "sessions" } as const;
    expect(handoffPatchSchema.safeParse(base).success).toBe(false);
    expect(handoffPatchSchema.safeParse({ ...base, firstDay: "2026-10-27" }).success).toBe(true);
    expect(handoffPatchSchema.safeParse({ ...base, casual: true }).success).toBe(true);
    let s = applyHandoff(state(), patch("children"), actor, "p", "now");
    s = applyHandoff(s, { ...base, casual: true, firstDay: "2026-10-27" }, actor, "p", "now");
    expect(s.steps.sessions).toMatchObject({ casual: true });
    expect(s.steps.sessions?.firstDay).toBeUndefined();
  });
  it("does not infer readiness from approval", () =>
    expect(handoffSummary(null, "p", "processed")).toBe("OWNA: not checked"));
  // Daniel, 20 Oct 2026: families from before the checklist count as done.
  it("enrolments from before 19 Oct read as complete; this week's don't", () => {
    expect(handoffSummary(null, "p", "processed", "2026-10-18T12:59:00Z")).toBe("OWNA: handoff complete");
    expect(handoffSummary(null, "p", "processed", "2026-10-18T13:00:00Z")).toBe("OWNA: not checked");
    expect(handoffSummary(null, "p", "submitted", "2026-10-01T00:00:00Z")).toBe("OWNA: awaiting approval");
  });
  it("ticking with no owner makes you the owner; prerequisites still apply", () => {
    const s = applyHandoff({ ...state(), owner: null }, patch("children"), actor, "p", "now");
    expect(s.owner).toEqual(actor);
    expect(() =>
      applyHandoff(state(), patch("access"), actor, "p", "now"),
    ).toThrow("child records");
  });
  it("supports existing access and reopens dependent checks", () => {
    let s = state();
    for (const step of [
      "children",
      "invitation",
      "access",
      "sessions",
      // 2026-10-21: "CCS applied" is the fifth tick.
      "ccs",
    ] as const)
      s = applyHandoff(s, patch(step), actor, "p", "now");
    expect(handoffSummary(s, "p", "processed")).toBe("OWNA: handoff complete");
    expect(s.steps.invitation?.mode).toBe("existing");
    s = applyHandoff(
      s,
      { ...patch("invitation"), action: "reopen" },
      actor,
      "p",
      "later",
    );
    expect(s.steps.access).toBeUndefined();
    expect(s.steps.sessions).toBeDefined();
    s = applyHandoff(
      s,
      { ...patch("children"), action: "reopen" },
      actor,
      "p",
      "later",
    );
    expect(s.steps).toEqual({});
  });
  // 2026-10-21: ticks made before Confirm survive Confirm.
  it("confirming (pending → active, processedAt set) keeps the checks current", () => {
    const before = { serviceId: "a", processedAt: null, childRecords: [{ id: "c", serviceId: "a", status: "pending" }] };
    const after = { serviceId: "a", processedAt: new Date("2026-10-21T01:00:00Z"), childRecords: [{ id: "c", serviceId: "a", status: "active" }] };
    expect(placementKey(before)).toBe(placementKey(after));
  });

  it("checklists saved under the old key still read as current", () => {
    const e = { serviceId: "a", processedAt: new Date("2026-10-18T01:00:00Z"), childRecords: [{ id: "c", serviceId: "a", status: "active" }] };
    const oldKey = JSON.stringify(["a", "2026-10-18T01:00:00.000Z", [["c", "a", "active"]]]);
    const saved = { ...state(), placement: oldKey, steps: { children: { at: "now", by: actor, evidence: "" } } };
    const current = normaliseHandoff(saved, e);
    expect(current?.placement).toBe(placementKey(e));
    expect(handoffSummary(current, placementKey(e), "processed")).toBe("OWNA: 1/5 checked");
  });

  it("invalidates moves, withdrawals and changed children", () => {
    const e = {
      serviceId: "a",
      childRecords: [{ id: "c", serviceId: "a", status: "active" }],
    };
    const key = placementKey(e);
    // Once something has been checked, a placement change invalidates it.
    const s = {
      ...state(),
      placement: key,
      steps: { children: { at: "now", by: actor, evidence: "Checked" } },
    };
    for (const child of [
      { id: "c", serviceId: "b", status: "active" },
      { id: "c", serviceId: "a", status: "withdrawn" },
      { id: "d", serviceId: "a", status: "active" },
    ])
      expect(
        handoffSummary(
          s,
          placementKey({ ...e, childRecords: [child] }),
          "processed",
        ),
      ).toBe("OWNA: recheck placement");
    expect(() =>
      applyHandoff(s, patch("children"), actor, "changed", "now"),
    ).toThrow("Enrolment details changed");
  });
  it("reset starts fresh and keeps the owner", () =>
    expect(
      applyHandoff(
        state(),
        { revision: 1, action: "reset", evidence: "New placement" },
        actor,
        "new",
        "now",
      ),
    ).toEqual({
      placement: "new",
      owner: actor,
      note: "New placement",
      steps: {},
    }));
});

it("routine child timestamp updates do not invalidate manual checks", () => {
  const e = {
    serviceId: "a",
    childRecords: [
      {
        id: "c",
        serviceId: "a",
        status: "active",
        updatedAt: "2026-10-01T00:00:00Z",
      },
    ],
  };
  const updated = {
    ...e,
    childRecords: [
      { ...e.childRecords[0], updatedAt: "2026-10-02T00:00:00Z" },
    ],
  };
  expect(placementKey(updated)).toBe(placementKey(e));
});

describe("owner set before approval", () => {
  it("follows the new placement when nothing has been checked yet", async () => {
    const { applyHandoff, handoffIsStale } = await import("@/lib/owna-handoff");
    const before = { placement: "old", owner: { id: "u1", name: "Jayden" }, note: "", steps: {} };
    expect(handoffIsStale(before, "new")).toBe(false);
    const next = applyHandoff(before, { revision: 0, action: "note", evidence: "Call Tuesday" }, { id: "u1", name: "Jayden" }, "new", "2026-10-20T00:00:00Z");
    expect(next.placement).toBe("new");
    expect(next.owner?.name).toBe("Jayden");
  });
});

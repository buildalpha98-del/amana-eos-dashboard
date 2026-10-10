import { describe, it, expect } from "vitest";
import {
  applyHandoff,
  handoffPatchSchema,
  handoffSummary,
  placementKey,
  type HandoffState,
  type HandoffPatch,
} from "@/lib/owna-handoff";
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
  it("requires evidence and an invitation arrangement", () => {
    expect(
      handoffPatchSchema.safeParse({
        revision: 0,
        action: "complete",
        step: "children",
      }).success,
    ).toBe(false);
    expect(
      handoffPatchSchema.safeParse({ ...patch("invitation"), mode: undefined })
        .success,
    ).toBe(false);
  });
  it("does not infer readiness from approval", () =>
    expect(handoffSummary(null, "p", "processed")).toBe("OWNA: not checked"));
  it("enforces owner and prerequisites", () => {
    expect(() =>
      applyHandoff(
        { ...state(), owner: null },
        patch("children"),
        actor,
        "p",
        "now",
      ),
    ).toThrow("ownership");
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
  it("invalidates moves, withdrawals and changed children", () => {
    const e = {
      serviceId: "a",
      childRecords: [{ id: "c", serviceId: "a", status: "active" }],
    };
    const key = placementKey(e);
    const s = { ...state(), placement: key };
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

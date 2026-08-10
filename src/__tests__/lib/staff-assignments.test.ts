import { describe, it, expect } from "vitest";
import {
  fromTraining,
  fromOnboarding,
  groupAssignments,
  type OnboardingAssignment,
  type TrainingAssignment,
} from "@/lib/staff-assignments";

const trainingRow = (
  over: Partial<TrainingAssignment> = {},
): TrainingAssignment => ({
  enrollmentId: "e-1",
  status: "enrolled",
  dueDate: null,
  enrolledAt: "2026-08-01T00:00:00.000Z",
  completedAt: null,
  user: { id: "u-1", name: "Aisha Khan", email: "a@x.com", role: "staff" },
  course: {
    id: "c-1",
    title: "Child Safety & You",
    track: "essential",
    status: "published",
  },
  progressPct: 40,
  countedInCompliance: true,
  ...over,
});

const packRow = (
  over: Partial<OnboardingAssignment> = {},
): OnboardingAssignment => ({
  id: "o-1",
  status: "in_progress",
  dueDate: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  completedAt: null,
  user: { id: "u-1", name: "Aisha Khan", email: "a@x.com" },
  pack: {
    id: "p-1",
    name: "New Educator Induction",
    service: { name: "Amana Auburn" },
    _count: { tasks: 4 },
  },
  progress: [
    { completed: true },
    { completed: true },
    { completed: false },
    { completed: false },
  ],
  ...over,
});

describe("fromTraining", () => {
  it("maps a course onto the unified shape", () => {
    const r = fromTraining(trainingRow());
    expect(r.kind).toBe("training");
    expect(r.assignmentId).toBe("e-1");
    expect(r.title).toBe("Child Safety & You");
    expect(r.subtitle).toBe("essential");
    expect(r.countedInCompliance).toBe(true);
    expect(r.courseStatus).toBe("published");
  });

  it("carries countedInCompliance false through for a draft course", () => {
    const r = fromTraining(
      trainingRow({
        countedInCompliance: false,
        course: {
          id: "c-1",
          title: "The Amana Way",
          track: "essential",
          status: "draft",
        },
      }),
    );
    expect(r.countedInCompliance).toBe(false);
    expect(r.courseStatus).toBe("draft");
  });
});

describe("fromOnboarding", () => {
  it("maps a pack onto the unified shape", () => {
    const r = fromOnboarding(packRow());
    expect(r.kind).toBe("onboarding");
    expect(r.assignmentId).toBe("o-1");
    expect(r.title).toBe("New Educator Induction");
    expect(r.subtitle).toBe("Amana Auburn");
  });

  it("computes progress from the per-task rows", () => {
    // 2 of 4 ticked
    expect(fromOnboarding(packRow()).progressPct).toBe(50);
  });

  it("says All centres for a pack with no service", () => {
    const r = fromOnboarding(packRow({ pack: { id: "p", name: "Global" } }));
    expect(r.subtitle).toBe("All centres");
  });

  it("never reports above 100% while the task backfill is mid-flight", () => {
    // pack._count.tasks is the pack's CURRENT count; progress is the
    // assignment's snapshot. They disagree until the lazy backfill runs.
    const r = fromOnboarding(
      packRow({
        progress: [{ completed: true }, { completed: true }],
        pack: { id: "p", name: "Pack", _count: { tasks: 5 } },
      }),
    );
    expect(r.progressPct).toBe(40);
    expect(r.progressPct).toBeLessThanOrEqual(100);
  });

  it("does not divide by zero for a pack with no tasks", () => {
    const r = fromOnboarding(
      packRow({ progress: [], pack: { id: "p", name: "Empty", _count: { tasks: 0 } } }),
    );
    expect(r.progressPct).toBe(0);
  });

  it("tolerates a missing progress array", () => {
    const r = fromOnboarding(
      packRow({ progress: undefined, pack: { id: "p", name: "P" } }),
    );
    expect(r.progressPct).toBe(0);
  });

  it("reports countedInCompliance as null, not false", () => {
    // null means "not applicable"; false means "not counted, here's why".
    // Collapsing them would put a misleading badge on every pack row.
    expect(fromOnboarding(packRow()).countedInCompliance).toBeNull();
  });
});

describe("groupAssignments", () => {
  it("puts both kinds under one person", () => {
    const g = groupAssignments([trainingRow()], [packRow()]);
    expect(g).toHaveLength(1);
    expect(g[0].items.map((i) => i.kind).sort()).toEqual([
      "onboarding",
      "training",
    ]);
  });

  it("groups by user id, not by name", () => {
    // Two staff can share a name; collapsing them would show one
    // person's assignments under another's.
    const g = groupAssignments(
      [
        trainingRow(),
        trainingRow({
          enrollmentId: "e-2",
          user: { id: "u-2", name: "Aisha Khan", email: "a2@x.com", role: "staff" },
        }),
      ],
      [],
    );
    expect(g).toHaveLength(2);
  });

  it("takes the role from whichever row carries one", () => {
    // Onboarding rows don't select role, so a pack-only person would
    // otherwise render with a blank role.
    const g = groupAssignments([], [packRow()]);
    expect(g[0].userRole).toBeNull();

    const mixed = groupAssignments([trainingRow()], [packRow()]);
    expect(mixed[0].userRole).toBe("staff");
  });

  it("sorts outstanding before completed", () => {
    const g = groupAssignments(
      [
        trainingRow({ enrollmentId: "done", status: "completed" }),
        trainingRow({ enrollmentId: "todo", status: "enrolled" }),
      ],
      [],
    );
    expect(g[0].items.map((i) => i.assignmentId)).toEqual(["todo", "done"]);
  });

  it("sorts people alphabetically", () => {
    const g = groupAssignments(
      [
        trainingRow({
          user: { id: "u-z", name: "Zara", email: "z@x.com", role: "staff" },
        }),
        trainingRow({
          enrollmentId: "e-9",
          user: { id: "u-a", name: "Adam", email: "ad@x.com", role: "staff" },
        }),
      ],
      [],
    );
    expect(g.map((x) => x.userName)).toEqual(["Adam", "Zara"]);
  });

  it("filters to training only", () => {
    const g = groupAssignments([trainingRow()], [packRow()], {
      kind: "training",
    });
    expect(g[0].items).toHaveLength(1);
    expect(g[0].items[0].kind).toBe("training");
  });

  it("filters to onboarding only", () => {
    const g = groupAssignments([trainingRow()], [packRow()], {
      kind: "onboarding",
    });
    expect(g[0].items).toHaveLength(1);
    expect(g[0].items[0].kind).toBe("onboarding");
  });

  it("searches across staff name, email and title", () => {
    const both = [trainingRow()];
    const packs = [packRow()];
    expect(groupAssignments(both, packs, { search: "aisha" })).toHaveLength(1);
    expect(groupAssignments(both, packs, { search: "a@x.com" })).toHaveLength(1);
    // Title search narrows to the matching row, not the whole person.
    const byTitle = groupAssignments(both, packs, { search: "educator" });
    expect(byTitle[0].items).toHaveLength(1);
    expect(byTitle[0].items[0].kind).toBe("onboarding");
  });

  it("is case-insensitive", () => {
    expect(
      groupAssignments([trainingRow()], [], { search: "CHILD SAFETY" }),
    ).toHaveLength(1);
  });

  it("returns nothing when there is nothing", () => {
    expect(groupAssignments([], [])).toEqual([]);
  });

  it("returns nothing when the search matches nothing", () => {
    expect(
      groupAssignments([trainingRow()], [packRow()], { search: "zzzz" }),
    ).toEqual([]);
  });
});

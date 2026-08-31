/**
 * Shared enrollment recompute (src/lib/lms-progress.ts) — the single helper
 * behind the quiz, module-progress, and enrollments routes.
 *
 * Pins: status derivation from required modules, the all-optional-course
 * never-completes rule, and the course score written on completion (average of
 * scored module progress) / cleared when completion is undone.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { recalcEnrollmentStatus } from "@/lib/lms-progress";

function enrollmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    startedAt: null,
    course: { modules: [{ id: "m1" }, { id: "m2" }] },
    moduleProgress: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.lMSEnrollment.update.mockResolvedValue({ id: "e1" });
});

describe("recalcEnrollmentStatus", () => {
  it("no-op when the enrollment does not exist", async () => {
    prismaMock.lMSEnrollment.findUnique.mockResolvedValue(null);
    await recalcEnrollmentStatus("missing");
    expect(prismaMock.lMSEnrollment.update).not.toHaveBeenCalled();
  });

  it("stays 'enrolled' with no completed modules", async () => {
    prismaMock.lMSEnrollment.findUnique.mockResolvedValue(enrollmentRow());
    await recalcEnrollmentStatus("e1");
    expect(prismaMock.lMSEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "enrolled", completedAt: null, score: null }),
      }),
    );
  });

  it("'in_progress' when some but not all required modules are complete", async () => {
    prismaMock.lMSEnrollment.findUnique.mockResolvedValue(
      enrollmentRow({
        moduleProgress: [{ moduleId: "m1", completed: true, score: 90 }],
      }),
    );
    await recalcEnrollmentStatus("e1");
    const { data } = prismaMock.lMSEnrollment.update.mock.calls[0][0];
    expect(data.status).toBe("in_progress");
    expect(data.completedAt).toBeNull();
    // Score is only written on completion.
    expect(data.score).toBeNull();
    expect(data.startedAt).toBeInstanceOf(Date);
  });

  it("'completed' writes the average of scored module progress as the course score", async () => {
    prismaMock.lMSEnrollment.findUnique.mockResolvedValue(
      enrollmentRow({
        moduleProgress: [
          { moduleId: "m1", completed: true, score: 80 },
          { moduleId: "m2", completed: true, score: 90 },
        ],
      }),
    );
    await recalcEnrollmentStatus("e1");
    const { data } = prismaMock.lMSEnrollment.update.mock.calls[0][0];
    expect(data.status).toBe("completed");
    expect(data.completedAt).toBeInstanceOf(Date);
    expect(data.score).toBe(85);
  });

  it("unscored (non-quiz) modules don't drag the average; all-unscored completes with null score", async () => {
    prismaMock.lMSEnrollment.findUnique.mockResolvedValue(
      enrollmentRow({
        moduleProgress: [
          { moduleId: "m1", completed: true, score: null },
          { moduleId: "m2", completed: true, score: 70 },
        ],
      }),
    );
    await recalcEnrollmentStatus("e1");
    expect(prismaMock.lMSEnrollment.update.mock.calls[0][0].data.score).toBe(70);

    prismaMock.lMSEnrollment.findUnique.mockResolvedValue(
      enrollmentRow({
        moduleProgress: [
          { moduleId: "m1", completed: true, score: null },
          { moduleId: "m2", completed: true, score: null },
        ],
      }),
    );
    await recalcEnrollmentStatus("e1");
    expect(prismaMock.lMSEnrollment.update.mock.calls[1][0].data.score).toBeNull();
  });

  it("a course with no required modules never completes", async () => {
    prismaMock.lMSEnrollment.findUnique.mockResolvedValue(
      enrollmentRow({
        course: { modules: [] },
        moduleProgress: [{ moduleId: "opt1", completed: true, score: 100 }],
      }),
    );
    await recalcEnrollmentStatus("e1");
    const { data } = prismaMock.lMSEnrollment.update.mock.calls[0][0];
    expect(data.status).toBe("in_progress");
    expect(data.score).toBeNull();
  });

  it("does not reset startedAt once set", async () => {
    prismaMock.lMSEnrollment.findUnique.mockResolvedValue(
      enrollmentRow({
        startedAt: new Date("2026-07-01"),
        moduleProgress: [{ moduleId: "m1", completed: true, score: 100 }],
      }),
    );
    await recalcEnrollmentStatus("e1");
    expect(prismaMock.lMSEnrollment.update.mock.calls[0][0].data.startedAt).toBeUndefined();
  });
});

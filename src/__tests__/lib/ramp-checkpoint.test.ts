import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } };
});
const notifyUser = vi.fn();
const notifyUsers = vi.fn();
vi.mock("@/lib/notify-user", () => ({
  notifyUser: (...a: unknown[]) => notifyUser(...a),
  notifyUsers: (...a: unknown[]) => notifyUsers(...a),
}));
const sendRampClosedEmail = vi.fn();
vi.mock("@/lib/ramp/emails", () => ({ sendRampClosedEmail: (...a: unknown[]) => sendRampClosedEmail(...a) }));
vi.mock("@/lib/ramp/recipients", () => ({
  resolveRampWatchers: vi.fn(async () => [
    { id: "mgr", name: "Mira", email: "mira@x" },
    { id: "hq", name: "Tracie", email: "tracie@x" },
  ]),
}));
vi.mock("@/lib/ramp/scorecard", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    loadRampScorecard: vi.fn(async () => ({
      day: 90,
      lengthDays: 90,
      stage: 90,
      rows: [{ key: "shifts", label: "Shifts worked", hint: "", format: "count", value: 30, target: 24, targets: { 30: 8, 60: 16, 90: 24 }, status: "met" }],
      overall: "on_track",
      lastMood: 4,
      recentFlags: 0,
      latestCheckpoint: null,
    })),
  };
});

import { buildProbationAssessment, ratingToReviewRating, submitRampCheckpoint } from "@/lib/ramp/checkpoint";

const start = new Date(Date.UTC(2026, 8, 1));
const end = new Date(Date.UTC(2026, 10, 30));
const ratings = { child_safety: 4, ratios: 4, programming: 4, families: 4, teamwork: 4, reliability: 4 };

function ramp(overrides: Record<string, unknown> = {}) {
  return {
    id: "ramp-1",
    userId: "u1",
    status: "active",
    startDate: start,
    endDate: end,
    user: { id: "u1", name: "Amina Yusuf" },
    checkIns: [],
    checkpoints: [
      { id: "cp30", day: 30, submittedAt: null },
      { id: "cp60", day: 60, submittedAt: null },
      { id: "cp90", day: 90, submittedAt: null },
    ],
    ...overrides,
  };
}

const reviewer = { id: "mgr", name: "Mira" };

describe("submitRampCheckpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.staffRamp.findUnique.mockResolvedValue(ramp());
    prismaMock.rampCheckpoint.update.mockResolvedValue({});
    prismaMock.rampCheckpoint.create.mockResolvedValue({});
    prismaMock.staffRamp.update.mockResolvedValue({});
    prismaMock.performanceReview.create.mockResolvedValue({ id: "rev-1" });
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.activityLog.create.mockResolvedValue({});
  });

  it("404s when the user has no ramp", async () => {
    prismaMock.staffRamp.findUnique.mockResolvedValue(null);
    await expect(submitRampCheckpoint(prismaMock as never, { userId: "u1", day: 30, reviewer, ratings, summary: null, recommendation: "on_track" })).rejects.toMatchObject({ status: 404 });
  });

  it("409s on an already-submitted checkpoint and on a closed ramp", async () => {
    prismaMock.staffRamp.findUnique.mockResolvedValue(ramp({ checkpoints: [{ id: "cp30", day: 30, submittedAt: new Date() }] }));
    await expect(submitRampCheckpoint(prismaMock as never, { userId: "u1", day: 30, reviewer, ratings, summary: null, recommendation: "on_track" })).rejects.toMatchObject({ status: 409 });
    prismaMock.staffRamp.findUnique.mockResolvedValue(ramp({ status: "completed" }));
    await expect(submitRampCheckpoint(prismaMock as never, { userId: "u1", day: 90, reviewer, ratings, summary: null, recommendation: "pass" })).rejects.toMatchObject({ status: 409 });
  });

  it("400s when the recommendation doesn't fit the stage", async () => {
    await expect(submitRampCheckpoint(prismaMock as never, { userId: "u1", day: 30, reviewer, ratings, summary: null, recommendation: "pass" })).rejects.toMatchObject({ status: 400 });
    await expect(submitRampCheckpoint(prismaMock as never, { userId: "u1", day: 90, reviewer, ratings, summary: null, recommendation: "on_track" })).rejects.toMatchObject({ status: 400 });
  });

  it("interim checkpoint records ratings and leaves the ramp active with no fan-out", async () => {
    const res = await submitRampCheckpoint(prismaMock as never, { userId: "u1", day: 30, reviewer, ratings, summary: "Doing well", recommendation: "on_track" });
    expect(res).toMatchObject({ status: "active", probationReviewId: null, average: 4 });
    expect(prismaMock.rampCheckpoint.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "cp30" },
      data: expect.objectContaining({ reviewerUserId: "mgr", ratings, summary: "Doing well", recommendation: "on_track" }),
    }));
    expect(prismaMock.staffRamp.update).not.toHaveBeenCalled();
    expect(prismaMock.performanceReview.create).not.toHaveBeenCalled();
    expect(notifyUsers).not.toHaveBeenCalled();
  });

  it("day-90 pass completes the ramp, creates the probation review and notifies everyone", async () => {
    const res = await submitRampCheckpoint(prismaMock as never, { userId: "u1", day: 90, reviewer, ratings, summary: "Great hire", recommendation: "pass" });
    expect(res).toMatchObject({ status: "completed", probationReviewId: "rev-1" });
    const review = prismaMock.performanceReview.create.mock.calls[0][0].data;
    expect(review).toMatchObject({
      userId: "u1", reviewerUserId: "mgr", createdById: "mgr", type: "probation", status: "manager_review",
      periodStart: start, periodEnd: end, overallRating: "exceeding_expectations",
    });
    expect(review.managerAssessment).toContain("Shifts worked: 30 (target 24) — met");
    expect(review.managerAssessment).toContain("Great hire");
    expect(prismaMock.staffRamp.update).toHaveBeenCalledWith({ where: { id: "ramp-1" }, data: expect.objectContaining({ status: "completed", probationReviewId: "rev-1" }) });
    expect(notifyUser).toHaveBeenCalledWith(expect.anything(), "u1", expect.objectContaining({ type: "ramp_completed" }));
    // watchers minus the reviewer
    expect(notifyUsers).toHaveBeenCalledWith(expect.anything(), ["hq"], expect.objectContaining({ type: "ramp_completed" }));
    expect(sendRampClosedEmail).toHaveBeenCalledTimes(1);
    expect(sendRampClosedEmail.mock.calls[0][0].to.id).toBe("hq");
  });

  it("day-90 extend pushes endDate +30, adds a day-120 checkpoint and updates probationEndDate", async () => {
    const res = await submitRampCheckpoint(prismaMock as never, { userId: "u1", day: 90, reviewer, ratings, summary: null, recommendation: "extend" });
    expect(res.status).toBe("extended");
    const newEnd = prismaMock.staffRamp.update.mock.calls[0][0].data.endDate as Date;
    expect(newEnd.toISOString().slice(0, 10)).toBe("2026-12-30");
    expect(prismaMock.rampCheckpoint.create).toHaveBeenCalledWith({ data: expect.objectContaining({ rampId: "ramp-1", day: 120 }) });
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { probationEndDate: newEnd } });
    expect(prismaMock.performanceReview.create).not.toHaveBeenCalled();
  });

  it("day-90 end closes the ramp as ended without a review", async () => {
    const res = await submitRampCheckpoint(prismaMock as never, { userId: "u1", day: 90, reviewer, ratings, summary: null, recommendation: "end" });
    expect(res.status).toBe("ended");
    expect(prismaMock.performanceReview.create).not.toHaveBeenCalled();
    expect(notifyUser).not.toHaveBeenCalled();
    expect(notifyUsers).toHaveBeenCalled();
  });

  it("an extension checkpoint (day 120) is final too", async () => {
    prismaMock.staffRamp.findUnique.mockResolvedValue(ramp({ status: "extended", checkpoints: [{ id: "cp120", day: 120, submittedAt: null }] }));
    const res = await submitRampCheckpoint(prismaMock as never, { userId: "u1", day: 120, reviewer, ratings, summary: null, recommendation: "pass" });
    expect(res.status).toBe("completed");
  });
});

describe("helpers", () => {
  it("maps averages onto ReviewRating bands", () => {
    expect(ratingToReviewRating(null)).toBeNull();
    expect(ratingToReviewRating(1.5)).toBe("below_expectations");
    expect(ratingToReviewRating(2.5)).toBe("partially_meeting");
    expect(ratingToReviewRating(3.9)).toBe("meeting_expectations");
    expect(ratingToReviewRating(4.5)).toBe("exceeding_expectations");
    expect(ratingToReviewRating(5)).toBe("exceptional");
  });

  it("assessment lists every competency", () => {
    const text = buildProbationAssessment(
      { day: 90, lengthDays: 90, stage: 90, rows: [], overall: "on_track", lastMood: null, recentFlags: 0, latestCheckpoint: null },
      { child_safety: 5 },
      null,
    );
    expect(text).toContain("Child safety & supervision: 5/5");
    expect(text).toContain("Reliability & punctuality: —");
  });
});

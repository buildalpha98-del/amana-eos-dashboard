import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } };
});
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => Promise.resolve({ limited: false })) }));
const submitRampCheckpoint = vi.fn();
vi.mock("@/lib/ramp/checkpoint", () => ({ submitRampCheckpoint: (...a: unknown[]) => submitRampCheckpoint(...a) }));

import { POST } from "@/app/api/ramps/[userId]/checkpoints/[day]/route";

const ctx = (userId: string, day: string) => ({ params: Promise.resolve({ userId, day }) }) as never;
const ratings = { child_safety: 4, ratios: 4, programming: 3, families: 4, teamwork: 5, reliability: 4 };
const post = (userId: string, day: string, body: Record<string, unknown>) =>
  POST(createRequest("POST", `/api/ramps/${userId}/checkpoints/${day}`, { body }), ctx(userId, day));

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  // withApiAuth's active-user check + canReviewRamp's service lookup.
  prismaMock.user.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
    if (args.where.id === "starter") return { active: true, service: { managerId: "mgr" } };
    return { active: true };
  });
  submitRampCheckpoint.mockResolvedValue({ status: "active", probationReviewId: null, average: 4 });
});

describe("POST /api/ramps/[userId]/checkpoints/[day]", () => {
  it("401 without a session", async () => {
    mockNoSession();
    expect((await post("starter", "30", { ratings, recommendation: "on_track" })).status).toBe(401);
  });

  it("403 for a staff-role user", async () => {
    mockSession({ id: "s1", name: "Staff", role: "staff" });
    expect((await post("starter", "30", { ratings, recommendation: "on_track" })).status).toBe(403);
  });

  it("403 when reviewing your own ramp", async () => {
    mockSession({ id: "starter", name: "Amina", role: "admin" });
    const res = await post("starter", "30", { ratings, recommendation: "on_track" });
    expect(res.status).toBe(403);
    expect(submitRampCheckpoint).not.toHaveBeenCalled();
  });

  it("403 for a coordinator who doesn't manage the starter's service", async () => {
    mockSession({ id: "other-coord", name: "Other", role: "member" });
    expect((await post("starter", "30", { ratings, recommendation: "on_track" })).status).toBe(403);
  });

  it("400 on an invalid day or incomplete ratings", async () => {
    mockSession({ id: "hq", name: "Tracie", role: "head_office" });
    expect((await post("starter", "abc", { ratings, recommendation: "on_track" })).status).toBe(400);
    expect((await post("starter", "30", { ratings: { child_safety: 4 }, recommendation: "on_track" })).status).toBe(400);
    expect((await post("starter", "30", { ratings: { ...ratings, ratios: 9 }, recommendation: "on_track" })).status).toBe(400);
  });

  it("the service manager can submit; ratings + trimmed summary reach the lib", async () => {
    mockSession({ id: "mgr", name: "Mira", role: "member" });
    const res = await post("starter", "30", { ratings, summary: "  Solid start  ", recommendation: "on_track" });
    expect(res.status).toBe(200);
    expect(submitRampCheckpoint).toHaveBeenCalledWith(expect.anything(), {
      userId: "starter",
      day: 30,
      reviewer: { id: "mgr", name: "Mira" },
      ratings,
      summary: "Solid start",
      recommendation: "on_track",
    });
  });

  it("a State Manager can submit the day-90 decision", async () => {
    mockSession({ id: "hq", name: "Tracie", role: "head_office" });
    submitRampCheckpoint.mockResolvedValue({ status: "completed", probationReviewId: "rev-1", average: 4 });
    const res = await post("starter", "90", { ratings, recommendation: "pass" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: "completed", probationReviewId: "rev-1" });
  });
});

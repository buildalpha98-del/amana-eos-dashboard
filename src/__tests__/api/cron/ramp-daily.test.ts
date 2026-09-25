import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { createRequest } from "../../helpers/request";

vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } };
});
const verifyCronSecret = vi.fn();
const acquireCronLock = vi.fn();
vi.mock("@/lib/cron-guard", () => ({
  verifyCronSecret: (req: unknown) => verifyCronSecret(req),
  acquireCronLock: (name: string, period: string) => acquireCronLock(name, period),
}));
const createStaffRamp = vi.fn();
vi.mock("@/lib/ramp/create", () => ({ createStaffRamp: (...a: unknown[]) => createStaffRamp(...a) }));
const sendRampCheckpointEmail = vi.fn();
vi.mock("@/lib/ramp/emails", () => ({ sendRampCheckpointEmail: (...a: unknown[]) => sendRampCheckpointEmail(...a) }));
const notifyUsers = vi.fn();
vi.mock("@/lib/notify-user", () => ({ notifyUsers: (...a: unknown[]) => notifyUsers(...a), notifyUser: vi.fn() }));
vi.mock("@/lib/ramp/recipients", () => ({
  resolveRampWatchers: vi.fn(async () => [{ id: "mgr", name: "Mira", email: "m@x" }, { id: "hq", name: "Tracie", email: "t@x" }]),
}));

import { GET } from "@/app/api/cron/ramp-daily/route";

const complete = vi.fn();
const fail = vi.fn();
const req = () => createRequest("GET", "/api/cron/ramp-daily", { headers: { authorization: "Bearer t" } });

beforeEach(() => {
  vi.clearAllMocks();
  verifyCronSecret.mockReturnValue(null);
  acquireCronLock.mockResolvedValue({ acquired: true, complete, fail });
  prismaMock.user.findMany.mockResolvedValue([]);
  prismaMock.rampCheckpoint.findMany.mockResolvedValue([]);
  prismaMock.rampCheckpoint.update.mockResolvedValue({});
  createStaffRamp.mockResolvedValue({ created: true, rampId: "r" });
  sendRampCheckpointEmail.mockResolvedValue(true);
});

describe("/api/cron/ramp-daily", () => {
  it("401s without the secret", async () => {
    verifyCronSecret.mockReturnValue({ error: Response.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await GET(createRequest("GET", "/api/cron/ramp-daily"))).status).toBe(401);
  });

  it("skips when the lock isn't acquired", async () => {
    acquireCronLock.mockResolvedValue({ acquired: false, reason: "done" });
    expect((await (await GET(req())).json()).skipped).toBe(true);
  });

  it("sweeps recent starters without a ramp", async () => {
    const start = new Date(Date.now() - 10 * 86_400_000);
    prismaMock.user.findMany.mockResolvedValue([{ id: "u1", startDate: start }, { id: "u2", startDate: null }]);
    const body = await (await GET(req())).json();
    const where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ active: true, ramp: null });
    expect(where.startDate.gte).toBeInstanceOf(Date);
    expect(createStaffRamp).toHaveBeenCalledTimes(1);
    expect(createStaffRamp).toHaveBeenCalledWith(expect.anything(), "u1", start, expect.any(Date));
    expect(body.rampsCreated).toBe(1);
  });

  it("sends a first request (stamps sentAt) and a reminder (stamps lastRemindedAt) to every watcher", async () => {
    prismaMock.rampCheckpoint.findMany.mockResolvedValue([
      { id: "cp30", day: 30, sentAt: null, ramp: { user: { id: "u1", name: "Amina" } } },
      { id: "cp90", day: 90, sentAt: new Date(Date.now() - 8 * 86_400_000), ramp: { user: { id: "u2", name: "Bilal" } } },
    ]);
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({ requestsSent: 1, remindersSent: 1 });
    expect(notifyUsers).toHaveBeenCalledTimes(2);
    expect(notifyUsers).toHaveBeenCalledWith(expect.anything(), ["mgr", "hq"], expect.objectContaining({ type: "ramp_checkpoint_due", title: "Day 30 checkpoint due — Amina", link: "/staff/u1#section-ramp" }));
    expect(notifyUsers).toHaveBeenCalledWith(expect.anything(), ["mgr", "hq"], expect.objectContaining({ title: "Reminder: Day 90 checkpoint due — Bilal" }));
    expect(sendRampCheckpointEmail).toHaveBeenCalledTimes(4);
    expect(sendRampCheckpointEmail).toHaveBeenCalledWith(expect.objectContaining({ day: 30, reminder: false, starterUserId: "u1" }));
    expect(sendRampCheckpointEmail).toHaveBeenCalledWith(expect.objectContaining({ day: 90, reminder: true }));
    expect(prismaMock.rampCheckpoint.update).toHaveBeenCalledWith({ where: { id: "cp30" }, data: { sentAt: expect.any(Date) } });
    expect(prismaMock.rampCheckpoint.update).toHaveBeenCalledWith({ where: { id: "cp90" }, data: { lastRemindedAt: expect.any(Date) } });
    expect(complete).toHaveBeenCalledWith({ rampsCreated: 0, requestsSent: 1, remindersSent: 1, errors: 0 });
  });

  it("only picks unsubmitted checkpoints on open ramps with active users", async () => {
    await GET(req());
    const where = prismaMock.rampCheckpoint.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ submittedAt: null, ramp: { status: { in: ["active", "extended"] }, user: { active: true } } });
    expect(where.OR).toHaveLength(3);
  });
});

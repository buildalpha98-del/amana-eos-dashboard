import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { createRequest } from "../../helpers/request";

const verifyCronSecret = vi.fn();
const acquireCronLock = vi.fn();
vi.mock("@/lib/cron-guard", () => ({
  verifyCronSecret: (req: unknown) => verifyCronSecret(req),
  acquireCronLock: (name: string, period: string) => acquireCronLock(name, period),
}));

import { GET } from "@/app/api/cron/retention-checkins/route";

const complete = vi.fn();
const fail = vi.fn();
const req = () => createRequest("GET", "/api/cron/retention-checkins", { headers: { authorization: "Bearer t" } });
const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
};

beforeEach(() => {
  vi.clearAllMocks();
  verifyCronSecret.mockReturnValue(null);
  acquireCronLock.mockResolvedValue({ acquired: true, complete, fail });
  prismaMock.todo.findFirst.mockResolvedValue(null);
  prismaMock.todo.create.mockResolvedValue({});
});

describe("/api/cron/retention-checkins", () => {
  it("401s without the secret", async () => {
    verifyCronSecret.mockReturnValue({ error: Response.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await GET(createRequest("GET", "/api/cron/retention-checkins"))).status).toBe(401);
  });

  it("creates the 1-month todo for someone without a ramp, and completes the lock", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u1", name: "Amina", startDate: monthsAgo(1), serviceId: "s1", ramp: null, service: { id: "s1", name: "Centre", managerId: "mgr" } },
    ]);
    const body = await (await GET(req())).json();
    expect(body.todosCreated).toBe(1);
    expect(prismaMock.todo.create.mock.calls[0][0].data.title).toContain("1-Month Check-In: Amina");
    expect(complete).toHaveBeenCalledWith({ staffChecked: 1, created: 1, skipped: 0 });
  });

  it("skips the 1- and 3-month todos when the person has a 90-day ramp", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u1", name: "Amina", startDate: monthsAgo(1), serviceId: "s1", ramp: { id: "r1" }, service: { id: "s1", name: "Centre", managerId: "mgr" } },
      { id: "u2", name: "Bilal", startDate: monthsAgo(3), serviceId: "s1", ramp: { id: "r2" }, service: { id: "s1", name: "Centre", managerId: "mgr" } },
      { id: "u3", name: "Cara", startDate: monthsAgo(6), serviceId: "s1", ramp: { id: "r3" }, service: { id: "s1", name: "Centre", managerId: "mgr" } },
    ]);
    const body = await (await GET(req())).json();
    expect(body.todosCreated).toBe(1);
    expect(prismaMock.todo.create.mock.calls[0][0].data.title).toContain("6-Month Check-In: Cara");
  });

  it("fails the lock and rethrows on a DB error", async () => {
    prismaMock.user.findMany.mockRejectedValue(new Error("boom"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(fail).toHaveBeenCalled();
  });
});

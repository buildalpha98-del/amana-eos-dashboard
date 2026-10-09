/**
 * OWNA-parity roster (2026-10-09): "I've seen my shifts", "I'm interested"
 * on open shifts with the Coordinator choosing, and wages only for the
 * people who run the roster.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 9, resetIn: 0 })) }));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "t",
}));
const notify = vi.hoisted(() => ({ notifyUsers: vi.fn(() => Promise.resolve(1)) }));
vi.mock("@/lib/notify-user", () => notify);
vi.mock("@/lib/induction", () => ({ assertUserCleared: vi.fn(() => Promise.resolve()) }));
vi.mock("@/app/api/roster/_lib/cert-guard", () => ({ assertStaffCertsValidForShift: vi.fn(() => Promise.resolve()) }));

import { POST as interest, DELETE as uninterest } from "@/app/api/roster/shifts/[id]/interest/route";
import { POST as claim } from "@/app/api/roster/shifts/[id]/claim/route";
import { POST as acknowledge } from "@/app/api/roster/shifts/acknowledge/route";
import { GET as ackStatus, POST as remind } from "@/app/api/roster/acknowledgements/route";
import { PATCH as patchShift } from "@/app/api/roster/shifts/[id]/route";
import { GET as cost } from "@/app/api/roster/cost-projection/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const future = new Date(Date.now() + 5 * 86400000);
const openShift = { id: "sh1", serviceId: "svc-a", userId: null, date: future, shiftStart: "15:00", shiftEnd: "18:30", status: "published", sessionType: "asc" };

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true, name: "Sarah Awad" });
  prismaMock.rosterShift.findUnique.mockResolvedValue(openShift);
  prismaMock.user.findMany.mockResolvedValue([{ id: "coord" }]);
  prismaMock.service.findUnique.mockResolvedValue({ managerId: null, appSettings: null });
  prismaMock.shiftInterest.upsert.mockResolvedValue({});
  prismaMock.shiftInterest.deleteMany.mockResolvedValue({ count: 1 });
  prismaMock.shiftInterest.findMany.mockResolvedValue([{ userId: "ed1" }, { userId: "ed2" }]);
});

describe("I'm interested", () => {
  beforeEach(() => mockSession({ id: "ed1", name: "Sarah Awad", role: "staff", serviceId: "svc-a" }));

  it("records the hand-up and tells the Coordinator", async () => {
    const res = await interest(createRequest("POST", "/api/roster/shifts/sh1/interest"), ctx("sh1"));
    expect(res.status).toBe(200);
    expect(prismaMock.shiftInterest.upsert).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(notify.notifyUsers).toHaveBeenCalledWith(expect.anything(), ["coord"], expect.objectContaining({ title: expect.stringMatching(/wants an open shift/) }));
  });

  it("can be taken back", async () => {
    const res = await uninterest(createRequest("DELETE", "/api/roster/shifts/sh1/interest"), ctx("sh1"));
    expect(res.status).toBe(200);
    expect(prismaMock.shiftInterest.deleteMany).toHaveBeenCalledWith({ where: { shiftId: "sh1", userId: "ed1" } });
  });

  it("only for open shifts at your own centre", async () => {
    prismaMock.rosterShift.findUnique.mockResolvedValue({ ...openShift, userId: "someone" });
    expect((await interest(createRequest("POST", "/x"), ctx("sh1"))).status).toBe(409);
    prismaMock.rosterShift.findUnique.mockResolvedValue({ ...openShift, serviceId: "svc-b" });
    expect((await interest(createRequest("POST", "/x"), ctx("sh1"))).status).toBe(403);
  });

  it("first-tap claiming is refused unless the centre turned it on", async () => {
    expect((await claim(createRequest("POST", "/x"), ctx("sh1"))).status).toBe(409);
  });
});

describe("the Coordinator gives the shift to someone", () => {
  it("clears the hand-ups and tells the winner and everyone else", async () => {
    mockSession({ id: "coord", name: "Greenacre", role: "member", serviceId: "svc-a" });
    prismaMock.rosterShift.findUnique.mockResolvedValue({ ...openShift, staffName: "Open shift", role: null });
    prismaMock.rosterShift.update.mockResolvedValue({ ...openShift, userId: "ed1" });
    const res = await patchShift(createRequest("PATCH", "/api/roster/shifts/sh1", { body: { userId: "ed1" } }), ctx("sh1"));
    expect(res.status).toBe(200);
    expect(prismaMock.shiftInterest.deleteMany).toHaveBeenCalledWith({ where: { shiftId: "sh1" } });
    const titles = notify.notifyUsers.mock.calls.map((c: unknown[]) => [(c[1] as string[]).join(","), (c[2] as { title: string }).title]);
    expect(titles).toEqual([["ed1", "You've got the open shift"], ["ed2", "That open shift has been filled"]]);
  });

  it("a changed shift has to be seen again", async () => {
    mockSession({ id: "coord", name: "Greenacre", role: "member", serviceId: "svc-a" });
    prismaMock.rosterShift.findUnique.mockResolvedValue({ ...openShift, userId: "ed1", staffName: "Sarah", role: null });
    prismaMock.rosterShift.update.mockResolvedValue({ ...openShift, userId: "ed1" });
    await patchShift(createRequest("PATCH", "/x", { body: { shiftEnd: "18:00" } }), ctx("sh1"));
    expect(prismaMock.rosterShift.update.mock.calls[0][0].data).toMatchObject({ acknowledgedAt: null });
  });
});

describe("I've seen my shifts", () => {
  it("stamps only the caller's own unseen shifts", async () => {
    mockSession({ id: "ed1", name: "Sarah", role: "staff", serviceId: "svc-a" });
    prismaMock.rosterShift.updateMany.mockResolvedValue({ count: 3 });
    const res = await acknowledge(createRequest("POST", "/x", { body: { from: "2026-10-12", to: "2026-10-25" } }));
    expect((await res.json()).acknowledged).toBe(3);
    expect(prismaMock.rosterShift.updateMany.mock.calls[0][0].where).toMatchObject({ userId: "ed1", acknowledgedAt: null });
  });

  it("the Coordinator sees who hasn't, and can remind just them", async () => {
    mockSession({ id: "coord", name: "Greenacre", role: "member", serviceId: "svc-a" });
    prismaMock.rosterShift.findMany.mockResolvedValue([
      { userId: "ed1", staffName: "Sarah", acknowledgedAt: new Date() },
      { userId: "ed2", staffName: "Omar", acknowledgedAt: null },
    ]);
    const body = await (await ackStatus(createRequest("GET", "/x?serviceId=svc-a&from=2026-10-12&to=2026-10-18"))).json();
    expect(body).toMatchObject({ seen: 1, total: 2 });
    await remind(createRequest("POST", "/x", { body: { serviceId: "svc-a", from: "2026-10-12", to: "2026-10-18" } }));
    expect(notify.notifyUsers).toHaveBeenCalledWith(expect.anything(), ["ed2"], expect.anything());
  });

  it("educators can't see the team's status", async () => {
    mockSession({ id: "ed1", name: "Sarah", role: "staff", serviceId: "svc-a" });
    expect((await ackStatus(createRequest("GET", "/x?serviceId=svc-a&from=2026-10-12&to=2026-10-18"))).status).toBe(403);
  });
});

describe("roster cost", () => {
  it("is for Coordinators and office, not educators", async () => {
    mockSession({ id: "ed1", name: "Sarah", role: "staff", serviceId: "svc-a" });
    expect((await cost(createRequest("GET", "/x?serviceId=svc-a&weekStart=2026-10-12"))).status).toBe(403);
  });
});

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
const sendRampCheckInEmail = vi.fn();
vi.mock("@/lib/ramp/emails", () => ({ sendRampCheckInEmail: (...a: unknown[]) => sendRampCheckInEmail(...a) }));

import { GET } from "@/app/api/cron/ramp-weekly-checkin/route";

const complete = vi.fn();
const fail = vi.fn();
const req = () => createRequest("GET", "/api/cron/ramp-weekly-checkin", { headers: { authorization: "Bearer t" } });

beforeEach(() => {
  vi.clearAllMocks();
  verifyCronSecret.mockReturnValue(null);
  acquireCronLock.mockResolvedValue({ acquired: true, complete, fail });
  prismaMock.rampCheckIn.update.mockResolvedValue({});
  sendRampCheckInEmail.mockResolvedValue(true);
});

describe("/api/cron/ramp-weekly-checkin", () => {
  it("401s without the secret", async () => {
    verifyCronSecret.mockReturnValue({ error: Response.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await GET(createRequest("GET", "/api/cron/ramp-weekly-checkin"))).status).toBe(401);
    expect(acquireCronLock).not.toHaveBeenCalled();
  });

  it("skips when the lock isn't acquired", async () => {
    acquireCronLock.mockResolvedValue({ acquired: false, reason: "done" });
    const body = await (await GET(req())).json();
    expect(body.skipped).toBe(true);
    expect(prismaMock.rampCheckIn.findMany).not.toHaveBeenCalled();
  });

  it("queries only due, unsent, unskipped check-ins on open ramps", async () => {
    prismaMock.rampCheckIn.findMany.mockResolvedValue([]);
    await GET(req());
    const where = prismaMock.rampCheckIn.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ sentAt: null, skipped: false, ramp: { status: { in: ["active", "extended"] } } });
    expect(where.dueAt.lte).toBeInstanceOf(Date);
  });

  it("emails active starters and stamps sentAt; inactive rows are skipped without email", async () => {
    prismaMock.rampCheckIn.findMany.mockResolvedValue([
      { id: "a", weekNumber: 2, token: "tok-a", ramp: { user: { id: "u1", name: "Amina Yusuf", email: "amina@x", active: true } } },
      { id: "b", weekNumber: 5, token: "tok-b", ramp: { user: { id: "u2", name: "Gone Person", email: "gone@x", active: false } } },
    ]);
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({ sent: 1, skippedInactive: 1, errors: [] });
    expect(sendRampCheckInEmail).toHaveBeenCalledTimes(1);
    expect(sendRampCheckInEmail).toHaveBeenCalledWith({ email: "amina@x", name: "Amina Yusuf", weekNumber: 2, token: "tok-a" });
    expect(prismaMock.rampCheckIn.update).toHaveBeenCalledWith({ where: { id: "a" }, data: { sentAt: expect.any(Date) } });
    expect(prismaMock.rampCheckIn.update).toHaveBeenCalledWith({ where: { id: "b" }, data: { sentAt: expect.any(Date), skipped: true } });
    expect(complete).toHaveBeenCalledWith({ sent: 1, skippedInactive: 1, errors: 0 });
  });

  it("a failed send is reported and doesn't stamp sentAt", async () => {
    prismaMock.rampCheckIn.findMany.mockResolvedValue([
      { id: "a", weekNumber: 2, token: "tok-a", ramp: { user: { id: "u1", name: "A", email: "a@x", active: true } } },
    ]);
    sendRampCheckInEmail.mockRejectedValue(new Error("smtp"));
    const body = await (await GET(req())).json();
    expect(body.sent).toBe(0);
    expect(body.errors).toHaveLength(1);
    expect(prismaMock.rampCheckIn.update).not.toHaveBeenCalled();
  });
});

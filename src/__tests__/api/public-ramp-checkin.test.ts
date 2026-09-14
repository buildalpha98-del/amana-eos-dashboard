import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } };
});
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => Promise.resolve({ limited: false })) }));
vi.mock("@/lib/activation-qr", () => ({ clientIpFromRequest: vi.fn(() => "1.2.3.4") }));
const notifyUsers = vi.fn();
vi.mock("@/lib/notify-user", () => ({ notifyUsers: (...a: unknown[]) => notifyUsers(...a), notifyUser: vi.fn() }));
const sendRampFlagEmail = vi.fn();
vi.mock("@/lib/ramp/emails", () => ({ sendRampFlagEmail: (...a: unknown[]) => sendRampFlagEmail(...a) }));
vi.mock("@/lib/ramp/recipients", () => ({
  resolveRampWatchers: vi.fn(async () => [{ id: "mgr", name: "Mira", email: "mira@x" }]),
}));

import { GET, POST } from "@/app/api/public/ramp-checkin/[token]/route";
import { checkRateLimit } from "@/lib/rate-limit";

const ctx = (token: string) => ({ params: Promise.resolve({ token }) }) as never;
const row = (over: Record<string, unknown> = {}) => ({
  id: "ci-1",
  weekNumber: 3,
  submittedAt: null,
  ramp: { status: "active", user: { id: "u1", name: "Amina Yusuf" } },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.rampCheckIn.update.mockResolvedValue({});
});

describe("GET /api/public/ramp-checkin/[token]", () => {
  it("404s on an unknown token", async () => {
    prismaMock.rampCheckIn.findUnique.mockResolvedValue(null);
    const res = await GET(createRequest("GET", "/api/public/ramp-checkin/bad"), ctx("bad"));
    expect(res.status).toBe(404);
  });

  it("returns first name, week and state", async () => {
    prismaMock.rampCheckIn.findUnique.mockResolvedValue(row());
    const res = await GET(createRequest("GET", "/api/public/ramp-checkin/t"), ctx("t"));
    expect(await res.json()).toEqual({ name: "Amina", weekNumber: 3, alreadySubmitted: false, closed: false });
  });
});

describe("POST /api/public/ramp-checkin/[token]", () => {
  it("429s when rate limited", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ limited: true } as never);
    const res = await POST(createRequest("POST", "/api/public/ramp-checkin/t", { body: { mood: 4 } }), ctx("t"));
    expect(res.status).toBe(429);
  });

  it("400s on a bad mood", async () => {
    const res = await POST(createRequest("POST", "/api/public/ramp-checkin/t", { body: { mood: 7 } }), ctx("t"));
    expect(res.status).toBe(400);
  });

  it("404s on an unknown token", async () => {
    prismaMock.rampCheckIn.findUnique.mockResolvedValue(null);
    const res = await POST(createRequest("POST", "/api/public/ramp-checkin/t", { body: { mood: 4 } }), ctx("t"));
    expect(res.status).toBe(404);
  });

  it("saves a happy answer with no fan-out", async () => {
    prismaMock.rampCheckIn.findUnique.mockResolvedValue(row());
    const res = await POST(
      createRequest("POST", "/api/public/ramp-checkin/t", { body: { mood: 4, wentWell: "Kids were great", struggling: "  " } }),
      ctx("t"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadySubmitted: false, flagged: false });
    const data = prismaMock.rampCheckIn.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ mood: 4, wentWell: "Kids were great", struggling: null, needsHelp: false, flaggedAt: null });
    expect(notifyUsers).not.toHaveBeenCalled();
    expect(sendRampFlagEmail).not.toHaveBeenCalled();
  });

  it("low mood flags the check-in and alerts the watchers (in-app + email)", async () => {
    prismaMock.rampCheckIn.findUnique.mockResolvedValue(row());
    const res = await POST(createRequest("POST", "/api/public/ramp-checkin/t", { body: { mood: 2 } }), ctx("t"));
    expect((await res.json()).flagged).toBe(true);
    expect(prismaMock.rampCheckIn.update.mock.calls[0][0].data.flaggedAt).toBeInstanceOf(Date);
    expect(notifyUsers).toHaveBeenCalledWith(expect.anything(), ["mgr"], expect.objectContaining({ type: "ramp_checkin_flagged", link: "/staff/u1#section-ramp" }));
    expect(sendRampFlagEmail).toHaveBeenCalledTimes(1);
  });

  it("'I need help' flags even with a good mood", async () => {
    prismaMock.rampCheckIn.findUnique.mockResolvedValue(row());
    const res = await POST(
      createRequest("POST", "/api/public/ramp-checkin/t", { body: { mood: 5, needsHelp: true, helpDetail: "A buddy for the morning session" } }),
      ctx("t"),
    );
    expect((await res.json()).flagged).toBe(true);
    expect(notifyUsers.mock.calls[0][2].body).toContain("A buddy for the morning session");
  });

  it("is idempotent", async () => {
    prismaMock.rampCheckIn.findUnique.mockResolvedValue(row({ submittedAt: new Date() }));
    const res = await POST(createRequest("POST", "/api/public/ramp-checkin/t", { body: { mood: 1 } }), ctx("t"));
    expect(await res.json()).toEqual({ ok: true, alreadySubmitted: true, flagged: false });
    expect(prismaMock.rampCheckIn.update).not.toHaveBeenCalled();
  });
});

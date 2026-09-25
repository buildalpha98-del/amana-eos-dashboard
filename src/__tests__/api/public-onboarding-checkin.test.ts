import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false })),
}));
vi.mock("@/lib/activation-qr", () => ({
  clientIpFromRequest: vi.fn(() => "1.2.3.4"),
}));

import { GET, POST } from "@/app/api/public/onboarding-checkin/[token]/route";

const ctx = (token: string) => ({ params: Promise.resolve({ token }) }) as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/public/onboarding-checkin/[token]", () => {
  it("returns 404 for an unknown token", async () => {
    prismaMock.newStarterCheckIn.findUnique.mockResolvedValue(null);
    const res = await GET(createRequest("GET", "/api/public/onboarding-checkin/bad"), ctx("bad"));
    expect(res.status).toBe(404);
  });

  it("returns the new starter's first name and milestone label", async () => {
    prismaMock.newStarterCheckIn.findUnique.mockResolvedValue({
      milestone: "week_1",
      submittedAt: null,
      user: { name: "Amina Yusuf" },
    });
    const res = await GET(createRequest("GET", "/api/public/onboarding-checkin/tok-1"), ctx("tok-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Amina");
    expect(body.milestoneLabel).toBe("first week");
    expect(body.alreadySubmitted).toBe(false);
  });
});

describe("POST /api/public/onboarding-checkin/[token]", () => {
  it("returns 404 for an unknown token", async () => {
    prismaMock.newStarterCheckIn.findUnique.mockResolvedValue(null);
    const res = await POST(
      createRequest("POST", "/api/public/onboarding-checkin/bad", { body: { mood: 4 } }),
      ctx("bad"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for an out-of-range mood", async () => {
    prismaMock.newStarterCheckIn.findUnique.mockResolvedValue({ submittedAt: null });
    const res = await POST(
      createRequest("POST", "/api/public/onboarding-checkin/tok-1", { body: { mood: 9 } }),
      ctx("tok-1"),
    );
    expect(res.status).toBe(400);
  });

  it("saves the mood + comments and stamps submittedAt", async () => {
    prismaMock.newStarterCheckIn.findUnique.mockResolvedValue({ submittedAt: null });
    prismaMock.newStarterCheckIn.update.mockResolvedValue({});
    const res = await POST(
      createRequest("POST", "/api/public/onboarding-checkin/tok-1", {
        body: { mood: 5, comments: "Loved my first week!" },
      }),
      ctx("tok-1"),
    );
    expect(res.status).toBe(200);
    const updateCall = prismaMock.newStarterCheckIn.update.mock.calls[0][0];
    expect(updateCall.data.mood).toBe(5);
    expect(updateCall.data.comments).toBe("Loved my first week!");
    expect(updateCall.data.submittedAt).toBeInstanceOf(Date);
  });

  it("is idempotent — resubmitting an already-answered check-in doesn't overwrite it", async () => {
    prismaMock.newStarterCheckIn.findUnique.mockResolvedValue({ submittedAt: new Date("2026-01-01") });
    const res = await POST(
      createRequest("POST", "/api/public/onboarding-checkin/tok-1", { body: { mood: 1 } }),
      ctx("tok-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alreadySubmitted).toBe(true);
    expect(prismaMock.newStarterCheckIn.update).not.toHaveBeenCalled();
  });

  it("rate-limits repeated submissions by IP", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ limited: true } as never);
    const res = await POST(
      createRequest("POST", "/api/public/onboarding-checkin/tok-1", { body: { mood: 3 } }),
      ctx("tok-1"),
    );
    expect(res.status).toBe(429);
  });
});

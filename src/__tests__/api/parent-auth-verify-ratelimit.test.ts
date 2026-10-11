import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";
import { verifyParentJwt } from "@/lib/parent-auth";
import { GET, HEAD, POST } from "@/app/api/parent/auth/verify/route";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  generateRequestId: () => "rid",
}));
const checkRateLimitMock = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args) }));

const token = "a".repeat(64);
const account = { id: "acc-1", email: "aysha@example.com", firstName: "Aysha", surname: "Khan", deactivatedAt: null, sessionVersion: 4 };
const validLink = () => ({ id: "ml-1", email: account.email, usedAt: null, expiresAt: new Date(Date.now() + 60_000) });
const request = (headers: Record<string, string> = {}, body: Record<string, unknown> = { token }) => createRequest("POST", "/api/parent/auth/verify", {
  body, headers: { origin: "http://localhost:3000", ...headers },
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PARENT_JWT_SECRET = "unit-test-parent-jwt-secret-at-least-32-characters";
  checkRateLimitMock.mockResolvedValue({ limited: false });
  prismaMock.parentMagicLink.findUnique.mockResolvedValue(validLink());
  prismaMock.parentMagicLink.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.parentAccount.findUnique.mockResolvedValue(account);
  prismaMock.parentEnquiry.findFirst.mockResolvedValue(null);
  prismaMock.$queryRaw.mockResolvedValue([]);
});

describe("email link inspection", () => {
  it("repeated GET and HEAD open confirmation without reading or consuming the token", async () => {
    for (const handler of [GET, HEAD, GET]) {
      const res = handler(new NextRequest(`http://localhost:3000/api/parent/auth/verify?token=${token}`));
      const destination = new URL(res.headers.get("location")!);
      expect(destination.pathname).toBe("/parent/login/confirm");
      expect(destination.search).toBe("");
      expect(destination.hash).toBe(`#token=${token}`);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.cookies.get("parent-session")).toBeUndefined();
    }
    expect(prismaMock.parentMagicLink.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.parentMagicLink.updateMany).not.toHaveBeenCalled();
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });
  it("rejects malformed links without putting their contents in the redirect", () => {
    const res = GET(createRequest("GET", "/api/parent/auth/verify?token=bad"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/parent/login?error=expired");
  });
});

describe("explicit login confirmation", () => {
  it("creates an account-backed session with no enrolment and preserves revocation version", async () => {
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, next: "/parent?v2=1" });
    const cookie = res.cookies.get("parent-session")!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("lax");
    expect(cookie.path).toBe("/");
    expect(await verifyParentJwt(cookie.value)).toMatchObject({ accountId: account.id, name: "Aysha Khan", sessionVersion: 4, enrolmentIds: [] });
    expect(prismaMock.parentMagicLink.updateMany).toHaveBeenCalledWith({
      where: { id: "ml-1", usedAt: null, expiresAt: { gt: expect.any(Date) } }, data: { usedAt: expect.any(Date) },
    });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("keeps legacy parents without an account able to sign in", async () => {
    prismaMock.parentAccount.findUnique.mockResolvedValue(null);
    prismaMock.$queryRaw.mockResolvedValue([{ id: "enr-1", first_name: "Aysha", surname: "Khan" }]);
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await verifyParentJwt(res.cookies.get("parent-session")!.value)).toMatchObject({ enrolmentIds: ["enr-1"] });
  });
  it.each([null, { ...validLink(), usedAt: new Date() }, { ...validLink(), expiresAt: new Date(0) }])("rejects unknown, used or expired tokens", async link => {
    prismaMock.parentMagicLink.findUnique.mockResolvedValue(link);
    const res = await POST(request());
    expect(res.status).toBe(400);
    expect(res.cookies.get("parent-session")).toBeUndefined();
    expect(prismaMock.parentMagicLink.updateMany).not.toHaveBeenCalled();
  });
  it("allows only one winner when requests race", async () => {
    prismaMock.parentMagicLink.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const responses = await Promise.all([POST(request()), POST(request())]);
    expect(responses.map(res => res.status).sort()).toEqual([200, 400]);
    expect(responses.filter(res => res.cookies.has("parent-session"))).toHaveLength(1);
  });
  it("leaves the token usable when a session lookup fails", async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error("database temporarily unavailable"));
    expect((await POST(request())).status).toBe(500);
    expect(prismaMock.parentMagicLink.updateMany).not.toHaveBeenCalled();
    expect((await POST(request())).status).toBe(200);
  });
  it("does not consume the token when preparation finishes after the server deadline", async () => {
    vi.useFakeTimers();
    try {
      let finishLookup!: (rows: unknown[]) => void;
      prismaMock.$queryRaw.mockImplementationOnce(() => new Promise(resolve => { finishLookup = resolve; }));
      const pending = POST(request());
      await vi.advanceTimersByTimeAsync(20_001);
      expect((await pending).status).toBe(504);
      finishLookup([]);
      await vi.advanceTimersByTimeAsync(0);
      expect(prismaMock.parentMagicLink.updateMany).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("waits for the atomic claim instead of returning a timeout while it commits", async () => {
    vi.useFakeTimers();
    try {
      let finishClaim!: (result: { count: number }) => void;
      prismaMock.parentMagicLink.updateMany.mockImplementationOnce(() => new Promise(resolve => { finishClaim = resolve; }));
      let completed = false;
      const pending = POST(request()).then(res => { completed = true; return res; });
      await vi.advanceTimersByTimeAsync(0);
      expect(prismaMock.parentMagicLink.updateMany).toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(20_001);
      expect(completed).toBe(false);
      finishClaim({ count: 1 });
      expect((await pending).status).toBe(200);
    } finally { vi.useRealTimers(); }
  });
  it("leaves the token usable when signing fails", async () => {
    delete process.env.PARENT_JWT_SECRET;
    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(prismaMock.parentMagicLink.updateMany).not.toHaveBeenCalled();
  });
  it("rejects a deactivated account without consuming the link", async () => {
    prismaMock.parentAccount.findUnique.mockResolvedValue({ ...account, deactivatedAt: new Date() });
    const res = await POST(request());
    expect(res.status).toBe(401);
    expect(res.cookies.get("parent-session")).toBeUndefined();
    expect(prismaMock.parentMagicLink.updateMany).not.toHaveBeenCalled();
  });
  it("rejects a revocation-version change during session preparation", async () => {
    prismaMock.parentAccount.findUnique.mockResolvedValueOnce(account).mockResolvedValue({ ...account, sessionVersion: 5 });
    expect((await POST(request())).status).toBe(401);
    expect(prismaMock.parentMagicLink.updateMany).not.toHaveBeenCalled();
  });
  it.each([{}, { origin: "https://attacker.example" }, { origin: "http://localhost:3000", "sec-fetch-site": "cross-site" }])("refuses missing/foreign origins and cross-site requests", async headers => {
    const res = await POST(createRequest("POST", "/api/parent/auth/verify", { body: { token }, headers }));
    expect(res.status).toBe(403);
    expect(prismaMock.parentMagicLink.findUnique).not.toHaveBeenCalled();
  });
  it("refuses non-JSON requests and malformed token bodies", async () => {
    expect((await POST(request({ "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(request({}, { token: "bad" }))).status).toBe(400);
    expect(prismaMock.parentMagicLink.findUnique).not.toHaveBeenCalled();
  });
  it("throttles redemption without consuming tokens", async () => {
    checkRateLimitMock.mockResolvedValue({ limited: true });
    const res = await POST(request());
    expect(res.status).toBe(429);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(prismaMock.parentMagicLink.findUnique).not.toHaveBeenCalled();
  });
});

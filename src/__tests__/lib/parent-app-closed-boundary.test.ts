/**
 * While the family app is closed (PARENT_APP_OPEN = false), withParentAuth
 * refuses every parent API except the enrolment flow, the thank-you page and
 * sign-in/out — server-side, so a cached tab, bookmark or direct call can't
 * reach what ParentShell no longer shows. Runs the REAL wrapper with a real
 * signed session cookie (other parent route tests mock the wrapper away).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 59, resetIn: 60_000 })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

import { signParentJwt, withParentAuth } from "@/lib/parent-auth";
import { PARENT_APP_OPEN, isParentApiAllowedWhileAppClosed } from "@/lib/parent-portal-lockdown";

const handler = vi.fn(async () => NextResponse.json({ ok: true }));
const route = withParentAuth(handler);

async function call(path: string) {
  const token = await signParentJwt({
    email: "family@example.test",
    name: "Family",
    enrolmentIds: [],
    sessionVersion: 0,
  });
  const req = new NextRequest(`http://localhost${path}`, { headers: { cookie: `parent-session=${token}` } });
  return route(req, { params: Promise.resolve({}) });
}

beforeEach(() => {
  process.env.PARENT_JWT_SECRET = "test-secret-for-the-closed-app-boundary";
  handler.mockClear();
  prismaMock.parentAccount.findUnique.mockResolvedValue({
    id: "acct-1",
    email: "family@example.test",
    deactivatedAt: null,
    sessionVersion: 0,
  });
  prismaMock.enrolmentSubmission.findMany.mockResolvedValue([]);
});

describe("parent APIs while the family app is closed", () => {
  it("the app ships closed", () => {
    expect(PARENT_APP_OPEN).toBe(false);
  });

  it.each([
    "/api/parent/messages",
    "/api/parent/messages/conv-1/reply",
    "/api/parent/children",
    "/api/parent/bookings",
    "/api/parent/statements",
    "/api/parent/posts/p1/like",
    "/api/parent/notifications",
    "/api/parent/push/subscription",
    "/api/parent/account",
    "/api/parent/daily-info",
  ])("refuses %s without running it", async (path) => {
    const res = await call(path);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/isn't open yet/);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    "/api/parent/state",
    "/api/parent/enrolment-draft",
    "/api/parent/enrolment-draft/submit",
    "/api/parent/enrolment-draft/sibling",
    "/api/parent/centres",
    "/api/parent/upload",
    "/api/parent/upload/image",
    "/api/parent/me",
  ])("keeps %s working for the enrolment flow and thank-you page", async (path) => {
    const res = await call(path);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("matches whole path segments, not prefixes of other words", () => {
    expect(isParentApiAllowedWhileAppClosed("/api/parent/me")).toBe(true);
    expect(isParentApiAllowedWhileAppClosed("/api/parent/messages")).toBe(false);
    expect(isParentApiAllowedWhileAppClosed("/api/parent/statesman")).toBe(false);
  });
});

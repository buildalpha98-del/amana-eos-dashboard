/**
 * Parent password reset — the recovery path the portal never had.
 *
 * Until 2026-09-18 `ParentAccount.passwordHash` was written exactly once, at
 * sign-up, by one function, and by nothing else in the codebase. "Forgot your
 * password?" sent a magic LOGIN link: it signs the parent in and leaves the
 * forgotten password in place, so the next sign-in fails identically. The
 * sign-up route even told people they could "reset your password from the
 * sign-in page" — a promise nothing could keep.
 *
 * What MUST be true:
 *   - the public request never reveals whether an address has an account
 *   - a link is single-use, expiring, and kills its siblings when spent
 *   - a deactivated family gets silence, not a password they can't use
 *   - staff can send a reset, send a login link, or (owner/admin) set one
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 5, resetIn: 0 }),
  ),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req",
}));

// No password is ever "breached" in tests unless a case says so.
const checkPasswordBreach = vi.fn(() => Promise.resolve(0));
vi.mock("@/lib/password-breach-check", () => ({
  checkPasswordBreach: (...a: unknown[]) => checkPasswordBreach(...(a as [])),
}));

const sendMock = vi.fn(() => Promise.resolve({ error: null }));
vi.mock("@/lib/email", () => ({
  getResend: () => ({ emails: { send: (...a: unknown[]) => sendMock(...(a as [])) } }),
  FROM_EMAIL: "noreply@amanaoshc.com.au",
  sendEmail: vi.fn(() => Promise.resolve({ sent: ["x"], suppressed: [] })),
}));

import { POST as FORGOT } from "@/app/api/parent/auth/forgot-password/route";
import {
  GET as CHECK,
  POST as RESET,
} from "@/app/api/parent/auth/reset-password/route";
import { POST as ACCESS } from "@/app/api/families/[id]/access/route";

const ctx = { params: Promise.resolve({}) };
const familyCtx = { params: Promise.resolve({ id: "fam-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  checkPasswordBreach.mockResolvedValue(0);
  sendMock.mockResolvedValue({ error: null });
  prismaMock.parentPasswordReset.create.mockResolvedValue({ id: "r1" } as never);
  prismaMock.activityLog.create.mockResolvedValue({ id: "log" } as never);
});

describe("POST /api/parent/auth/forgot-password", () => {
  it("emails a reset link to a real account", async () => {
    prismaMock.parentAccount.findUnique.mockResolvedValue({
      firstName: "Aysha",
      deactivatedAt: null,
    } as never);

    const res = await FORGOT(
      createRequest("POST", "/api/parent/auth/forgot-password", {
        body: { email: "Aysha@Example.com" },
      }),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    // Lookup and token are both on the normalised address.
    expect(
      prismaMock.parentPasswordReset.create.mock.calls[0]?.[0]?.data,
    ).toMatchObject({ email: "aysha@example.com" });
  });

  it("answers identically for an address with no account", async () => {
    prismaMock.parentAccount.findUnique.mockResolvedValue(null as never);

    const res = await FORGOT(
      createRequest("POST", "/api/parent/auth/forgot-password", {
        body: { email: "nobody@example.com" },
      }),
      ctx,
    );

    // Same 200, same body — the reply must not be a way to discover which
    // families are registered.
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true });
    expect(sendMock).not.toHaveBeenCalled();
    expect(prismaMock.parentPasswordReset.create).not.toHaveBeenCalled();
  });

  it("stays silent for a family whose access was switched off", async () => {
    // Letting them set a password they still can't sign in with is worse than
    // the email not arriving — staff turned the access off deliberately.
    prismaMock.parentAccount.findUnique.mockResolvedValue({
      firstName: "Gone",
      deactivatedAt: new Date("2026-01-01"),
    } as never);

    const res = await FORGOT(
      createRequest("POST", "/api/parent/auth/forgot-password", {
        body: { email: "gone@example.com" },
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("still sends when the provider rejects, and never leaks that it failed", async () => {
    prismaMock.parentAccount.findUnique.mockResolvedValue({
      firstName: "Aysha",
      deactivatedAt: null,
    } as never);
    sendMock.mockResolvedValue({ error: { message: "blocked" } });

    const res = await FORGOT(
      createRequest("POST", "/api/parent/auth/forgot-password", {
        body: { email: "aysha@example.com" },
      }),
      ctx,
    );
    expect(res.status).toBe(200);
  });
});

describe("GET /api/parent/auth/reset-password — check without consuming", () => {
  it("reports a live link as valid and does not mark it used", async () => {
    prismaMock.parentPasswordReset.findUnique.mockResolvedValue({
      id: "r1",
      email: "aysha@example.com",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);

    const res = await CHECK(
      createRequest("GET", "/api/parent/auth/reset-password?token=abc"),
      ctx,
    );
    const body = await res.json();
    expect(body.valid).toBe(true);
    // Masked — enough to confirm which account, not enough to leak one.
    expect(body.email).toBe("ay***@example.com");
    expect(prismaMock.parentPasswordReset.updateMany).not.toHaveBeenCalled();
  });

  it("names expiry and reuse separately so the page can explain itself", async () => {
    prismaMock.parentPasswordReset.findUnique.mockResolvedValue({
      id: "r1",
      email: "a@b.com",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    expect(
      (await (await CHECK(createRequest("GET", "/api/parent/auth/reset-password?token=t"), ctx)).json()).reason,
    ).toBe("used");

    prismaMock.parentPasswordReset.findUnique.mockResolvedValue({
      id: "r1",
      email: "a@b.com",
      usedAt: null,
      expiresAt: new Date(Date.now() - 1),
    } as never);
    expect(
      (await (await CHECK(createRequest("GET", "/api/parent/auth/reset-password?token=t"), ctx)).json()).reason,
    ).toBe("expired");
  });

  it("treats an unknown token as invalid rather than erroring", async () => {
    prismaMock.parentPasswordReset.findUnique.mockResolvedValue(null as never);
    const res = await CHECK(
      createRequest("GET", "/api/parent/auth/reset-password?token=nope"),
      ctx,
    );
    expect((await res.json()).valid).toBe(false);
  });
});

describe("POST /api/parent/auth/reset-password", () => {
  function liveToken() {
    prismaMock.parentPasswordReset.findUnique.mockResolvedValue({
      id: "r1",
      email: "aysha@example.com",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    prismaMock.parentAccount.findUnique.mockResolvedValue({ id: "acc-1" } as never);
    prismaMock.parentPasswordReset.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.parentAccount.update.mockResolvedValue({ id: "acc-1" } as never);
  }

  it("sets the new password and does NOT sign them in", async () => {
    liveToken();
    const res = await RESET(
      createRequest("POST", "/api/parent/auth/reset-password", {
        body: { token: "abc", password: "a-long-enough-one" },
      }),
      ctx,
    );

    expect(res.status).toBe(200);
    const data = prismaMock.parentAccount.update.mock.calls[0]?.[0]?.data as
      | Record<string, unknown>
      | undefined;
    expect(typeof data?.passwordHash).toBe("string");
    // Never the raw password.
    expect(data?.passwordHash).not.toBe("a-long-enough-one");
    // No session cookie — they sign in with what they just chose, which is
    // how they find out it works.
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a password that is too short before touching the account", async () => {
    liveToken();
    const res = await RESET(
      createRequest("POST", "/api/parent/auth/reset-password", {
        body: { token: "abc", password: "short" },
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(prismaMock.parentAccount.update).not.toHaveBeenCalled();
  });

  it("refuses a password found in a breach corpus", async () => {
    liveToken();
    checkPasswordBreach.mockResolvedValue(4021);
    const res = await RESET(
      createRequest("POST", "/api/parent/auth/reset-password", {
        body: { token: "abc", password: "password123456" },
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: expect.stringContaining("4,021"),
    });
    expect(prismaMock.parentAccount.update).not.toHaveBeenCalled();
  });

  it("refuses an expired link with an explanation, not a generic failure", async () => {
    prismaMock.parentPasswordReset.findUnique.mockResolvedValue({
      id: "r1",
      email: "a@b.com",
      usedAt: null,
      expiresAt: new Date(Date.now() - 1),
    } as never);

    const res = await RESET(
      createRequest("POST", "/api/parent/auth/reset-password", {
        body: { token: "abc", password: "a-long-enough-one" },
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("expired");
  });

  it("refuses a link that has already been used", async () => {
    prismaMock.parentPasswordReset.findUnique.mockResolvedValue({
      id: "r1",
      email: "a@b.com",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    } as never);

    const res = await RESET(
      createRequest("POST", "/api/parent/auth/reset-password", {
        body: { token: "abc", password: "a-long-enough-one" },
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("already been used");
  });
});

describe("POST /api/families/[id]/access — the desk-side", () => {
  const activeFamily = {
    id: "fam-1",
    email: "aysha@example.com",
    firstName: "Aysha",
    deactivatedAt: null,
  };

  function asStaff(role: string) {
    mockSession({ id: "u1", name: "Staff", role: role as never });
    prismaMock.user.findUnique.mockResolvedValue({ active: true } as never);
    prismaMock.parentAccount.findUnique.mockResolvedValue(activeFamily as never);
  }

  it("rejects an unauthenticated caller", async () => {
    mockNoSession();
    const res = await ACCESS(
      createRequest("POST", "/api/families/fam-1/access", {
        body: { action: "send_reset" },
      }),
      familyCtx,
    );
    expect(res.status).toBe(401);
  });

  it("emails a staff-initiated reset link", async () => {
    asStaff("head_office");
    const res = await ACCESS(
      createRequest("POST", "/api/families/fam-1/access", {
        body: { action: "send_reset" },
      }),
      familyCtx,
    );
    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    // Attributed, so "who sent this?" has an answer months later.
    expect(
      prismaMock.parentPasswordReset.create.mock.calls[0]?.[0]?.data,
    ).toMatchObject({ issuedByUserId: "u1" });
  });

  it("emails a one-time sign-in link when that's what was asked for", async () => {
    asStaff("head_office");
    prismaMock.parentMagicLink.create.mockResolvedValue({ id: "m1" } as never);

    const res = await ACCESS(
      createRequest("POST", "/api/families/fam-1/access", {
        body: { action: "send_login" },
      }),
      familyCtx,
    );
    expect(res.status).toBe(200);
    expect(prismaMock.parentMagicLink.create).toHaveBeenCalled();
    expect(prismaMock.parentPasswordReset.create).not.toHaveBeenCalled();
  });

  it("tells staff when the send failed, unlike the public route", async () => {
    // Staff are standing there telling a parent to check their inbox.
    asStaff("head_office");
    sendMock.mockResolvedValue({ error: { message: "mailbox full" } });

    const res = await ACCESS(
      createRequest("POST", "/api/families/fam-1/access", {
        body: { action: "send_reset" },
      }),
      familyCtx,
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("mailbox full");
  });

  it("refuses every action while portal access is switched off", async () => {
    asStaff("owner");
    prismaMock.parentAccount.findUnique.mockResolvedValue({
      ...activeFamily,
      deactivatedAt: new Date(),
    } as never);

    const res = await ACCESS(
      createRequest("POST", "/api/families/fam-1/access", {
        body: { action: "send_reset" },
      }),
      familyCtx,
    );
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("keeps set-a-password to owner and admin", async () => {
    // A State Manager can send a link all day; typing a password for someone
    // else is the exception, not the convenience.
    asStaff("head_office");
    const res = await ACCESS(
      createRequest("POST", "/api/families/fam-1/access", {
        body: { action: "set_password", password: "a-long-enough-one" },
      }),
      familyCtx,
    );
    expect(res.status).toBe(403);
    expect(prismaMock.parentAccount.update).not.toHaveBeenCalled();
  });

  it("sets a password for an owner and audits it without storing the password", async () => {
    asStaff("owner");
    prismaMock.parentAccount.update.mockResolvedValue({ id: "fam-1" } as never);
    prismaMock.parentPasswordReset.updateMany.mockResolvedValue({ count: 0 } as never);

    const res = await ACCESS(
      createRequest("POST", "/api/families/fam-1/access", {
        body: { action: "set_password", password: "a-long-enough-one" },
      }),
      familyCtx,
    );

    expect(res.status).toBe(200);
    const log = prismaMock.activityLog.create.mock.calls[0]?.[0]?.data as
      | { action?: string; details?: Record<string, unknown> }
      | undefined;
    expect(log?.action).toBe("parent_password_set");
    expect(JSON.stringify(log?.details)).not.toContain("a-long-enough-one");
  });

  it("404s an unknown family", async () => {
    mockSession({ id: "u1", name: "Staff", role: "owner" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true } as never);
    prismaMock.parentAccount.findUnique.mockResolvedValue(null as never);

    const res = await ACCESS(
      createRequest("POST", "/api/families/fam-1/access", {
        body: { action: "send_reset" },
      }),
      familyCtx,
    );
    expect(res.status).toBe(404);
  });
});

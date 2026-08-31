import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    withRequestId: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
  generateRequestId: () => "rid",
}));

const checkRateLimitMock = vi.fn(async () => ({ limited: false, remaining: 9, resetIn: 0 }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => checkRateLimitMock(),
}));

vi.mock("@/lib/parent-auth", () => ({ signParentJwt: vi.fn(async () => "jwt-token") }));

import { GET } from "@/app/api/parent/auth/verify/route";

describe("GET /api/parent/auth/verify — rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({ limited: false, remaining: 9, resetIn: 0 });
  });

  it("redirects to the login error and skips the DB lookup when rate limited", async () => {
    checkRateLimitMock.mockResolvedValue({ limited: true, remaining: 0, resetIn: 60_000 });

    const res = await GET(
      createRequest("GET", "/api/parent/auth/verify?token=abc", {
        headers: { "x-forwarded-for": "1.2.3.4" },
      }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/parent/login");
    expect(prismaMock.parentMagicLink.findUnique).not.toHaveBeenCalled();
  });

  it("proceeds to verify the token when under the limit", async () => {
    prismaMock.parentMagicLink.findUnique.mockResolvedValue(null); // invalid token → normal error redirect

    const res = await GET(
      createRequest("GET", "/api/parent/auth/verify?token=abc", {
        headers: { "x-forwarded-for": "1.2.3.4" },
      }),
    );

    expect(checkRateLimitMock).toHaveBeenCalled();
    expect(prismaMock.parentMagicLink.findUnique).toHaveBeenCalled();
    expect(res.status).toBe(307);
  });
});

/**
 * The session a magic link hands out.
 *
 * `login` has always put `accountId` on the JWT; this route didn't. The
 * enrolment draft is keyed by account, so `requireAccountId` refused it
 * with "Please sign in with your Amana OSHC account to continue your
 * enrolment" — said to a parent who just used the only recovery path
 * they have, about the password they've forgotten.
 *
 * That made fixing the send side hollow: a link that arrives and then
 * can't reach their half-finished enrolment is barely better than no
 * link at all.
 */
describe("GET /api/parent/auth/verify — the session it creates", () => {
  const validLink = {
    id: "ml-1",
    email: "aysha@example.com",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({ limited: false, remaining: 9, resetIn: 0 });
    prismaMock.parentMagicLink.findUnique.mockResolvedValue(validLink);
    prismaMock.parentMagicLink.update.mockResolvedValue(validLink);
    prismaMock.parentEnquiry.findFirst.mockResolvedValue(null);
    prismaMock.$queryRaw.mockResolvedValue([]);
  });

  it("carries accountId, so the parent can reach their draft", async () => {
    prismaMock.parentAccount.findUnique.mockResolvedValue({
      id: "acc-1",
      firstName: "Aysha",
      surname: "Khan",
      deactivatedAt: null,
    });

    const { signParentJwt } = await import("@/lib/parent-auth");
    await GET(createRequest("GET", "/api/parent/auth/verify?token=abc"));

    expect(signParentJwt).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acc-1" }),
    );
  });

  it("signs a parent in even with no submitted enrolment", async () => {
    // Exactly the reported group: an account, a draft, nothing else.
    // Zero enrolments is a valid session — the portal routes them to
    // the form, which is where they were going anyway.
    prismaMock.parentAccount.findUnique.mockResolvedValue({
      id: "acc-1",
      firstName: "Aysha",
      surname: "Khan",
      deactivatedAt: null,
    });

    const { signParentJwt } = await import("@/lib/parent-auth");
    await GET(createRequest("GET", "/api/parent/auth/verify?token=abc"));

    expect(signParentJwt).toHaveBeenCalledWith(
      expect.objectContaining({ enrolmentIds: [] }),
    );
  });

  it("still signs a pre-accounts session when there is no account", async () => {
    // Older magic links predate ParentAccount. They keep working, just
    // without draft access — the behaviour that was always intended.
    prismaMock.parentAccount.findUnique.mockResolvedValue(null);

    const { signParentJwt } = await import("@/lib/parent-auth");
    await GET(createRequest("GET", "/api/parent/auth/verify?token=abc"));

    const arg = vi.mocked(signParentJwt).mock.calls[0][0];
    expect(arg).not.toHaveProperty("accountId");
  });
});

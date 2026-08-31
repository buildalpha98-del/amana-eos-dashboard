/**
 * A session minted before the magic link learned to carry `accountId`.
 *
 * `login` has always signed it; `verify` only started on 2026-08-13.
 * Those JWTs last 30 days, so without a backfill every parent holding
 * an older magic-link session stays locked out of their own enrolment
 * draft until it expires — and the portal REDIRECTS them into that
 * form, where they type the whole thing against a status line reading
 * "Not saved" and are refused on submit.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false })),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    }),
  },
  generateRequestId: () => "rid",
}));

/**
 * A real signed JWT, not a stubbed session.
 *
 * `withParentAuth` calls `getParentSession` module-locally, so spying
 * on the export doesn't intercept it — and a test that thinks it has
 * stubbed the session passes vacuously. Minting a genuine token and
 * putting it on the cookie exercises the path the parent actually
 * takes.
 */
process.env.PARENT_JWT_SECRET =
  process.env.PARENT_JWT_SECRET ?? "test-secret-at-least-32-characters-long";

import { signParentJwt, withParentAuth } from "@/lib/parent-auth";

const run = async (payload: Parameters<typeof signParentJwt>[0]) => {
  const token = await signParentJwt(payload);
  let seen: Record<string, unknown> | undefined;

  const handler = withParentAuth(async (_req, ctx) => {
    seen = { ...ctx.parent } as unknown as Record<string, unknown>;
    const { NextResponse } = await import("next/server");
    return NextResponse.json({ ok: true });
  });

  await handler(
    createRequest("GET", "/api/parent/state", {
      headers: { cookie: `parent-session=${token}` },
    }) as never,
  );
  return seen;
};

const legacySession = {
  email: "Aysha@Example.com",
  name: "Aysha Khan",
  enrolmentIds: [] as string[],
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.enrolmentSubmission.findMany.mockResolvedValue([]);
});

describe("withParentAuth — legacy sessions with no accountId", () => {
  it("resolves the account from the email", async () => {
    prismaMock.parentAccount.findUnique.mockResolvedValue({
      id: "acc-1",
      deactivatedAt: null,
    });

    const parent = await run(legacySession);
    expect(parent?.accountId).toBe("acc-1");
  });

  it("normalises the email before looking it up", async () => {
    // The JWT carries whatever case was typed; the column is lowercase.
    prismaMock.parentAccount.findUnique.mockResolvedValue({
      id: "acc-1",
      deactivatedAt: null,
    });

    await run(legacySession);
    const arg = prismaMock.parentAccount.findUnique.mock.calls[0][0] as {
      where: { email: string };
    };
    expect(arg.where.email).toBe("aysha@example.com");
  });

  it("refuses to adopt a deactivated account", async () => {
    prismaMock.parentAccount.findUnique.mockResolvedValue({
      id: "acc-1",
      deactivatedAt: new Date(),
    });

    const parent = await run(legacySession);
    expect(parent?.accountId).toBeUndefined();
  });

  it("leaves a session with no matching account alone", async () => {
    prismaMock.parentAccount.findUnique.mockResolvedValue(null);
    const parent = await run(legacySession);
    expect(parent?.accountId).toBeUndefined();
  });

  it("doesn't re-query when the session already carries one", async () => {
    const parent = await run({ ...legacySession, accountId: "acc-existing" });
    expect(parent?.accountId).toBe("acc-existing");
    expect(prismaMock.parentAccount.findUnique).not.toHaveBeenCalled();
  });
});

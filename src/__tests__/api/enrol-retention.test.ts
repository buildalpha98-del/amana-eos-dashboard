/**
 * What the enrolment flow keeps, and for how long.
 *
 * A submitted `EnrolmentDraft` holds a full copy of the enrolment —
 * Medicare numbers, CRNs, medical conditions, the doctor's details —
 * after that same data has been written to `EnrolmentSubmission`.
 * Nothing reads it once `submittedAt` is set: the GET returns the flag
 * and the PUT refuses to write. It was a duplicate of the most
 * sensitive data in the system, kept forever, with no cleanup job.
 *
 * `ParentEmailVerification` was the same shape as the two token tables
 * the cron already swept — hashed, 24h TTL — and simply never listed.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));
vi.mock("@/lib/cron-guard", () => ({
  verifyCronSecret: vi.fn(() => null),
  acquireCronLock: vi.fn(() =>
    Promise.resolve({
      acquired: true,
      complete: vi.fn(() => Promise.resolve()),
      fail: vi.fn(() => Promise.resolve()),
    }),
  ),
}));

import { GET } from "@/app/api/cron/cleanup-tokens/route";

const run = () =>
  GET(createRequest("GET", "/api/cron/cleanup-tokens"), undefined as never);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.parentMagicLink.deleteMany.mockResolvedValue({ count: 1 });
  prismaMock.parentAuthToken.deleteMany.mockResolvedValue({ count: 2 });
  prismaMock.parentEmailVerification.deleteMany.mockResolvedValue({ count: 3 });
  prismaMock.enrolmentDraft.updateMany.mockResolvedValue({ count: 4 });
});

describe("cleanup-tokens — expired verification tokens", () => {
  it("sweeps them, like the two token tables beside it", async () => {
    await run();
    expect(prismaMock.parentEmailVerification.deleteMany).toHaveBeenCalled();
  });

  it("only takes expired ones", async () => {
    await run();
    const arg = prismaMock.parentEmailVerification.deleteMany.mock
      .calls[0][0] as { where: { expiresAt: { lt: Date } } };
    expect(arg.where.expiresAt.lt).toBeInstanceOf(Date);
    expect(arg.where.expiresAt.lt.getTime()).toBeLessThan(Date.now());
  });

  it("counts them in the response", async () => {
    const body = await (await run()).json();
    expect(body.emailVerifications).toBe(3);
  });
});

describe("cleanup-tokens — submitted enrolment drafts", () => {
  it("clears the payload rather than deleting the row", async () => {
    // `submittedAt` is what stops a parent re-submitting. Deleting the
    // row would quietly unlock a second enrolment.
    await run();
    expect(prismaMock.enrolmentDraft.deleteMany).not.toHaveBeenCalled();

    const arg = prismaMock.enrolmentDraft.updateMany.mock.calls[0][0] as {
      data: { data: unknown };
    };
    expect(arg.data).toEqual({ data: {} });
  });

  it("never touches a draft that hasn't been submitted", async () => {
    // That one is a family's unfinished work, not a duplicate.
    //
    // `{ not: null }` reads oddly: it is Prisma's idiom for IS NOT
    // NULL, so the value really is `null` and the key's presence is
    // the assertion.
    await run();
    const arg = prismaMock.enrolmentDraft.updateMany.mock.calls[0][0] as {
      where: { submittedAt: Record<string, unknown> };
    };
    expect(arg.where.submittedAt).toHaveProperty("not", null);
  });

  it("leaves a recently submitted one alone", async () => {
    // Staff comparing a submission against what the parent typed get a
    // month before the copy goes.
    await run();
    const arg = prismaMock.enrolmentDraft.updateMany.mock.calls[0][0] as {
      where: { submittedAt: { lt: Date } };
    };
    const daysAgo =
      (Date.now() - arg.where.submittedAt.lt.getTime()) / 86_400_000;
    expect(daysAgo).toBeGreaterThan(29);
    expect(daysAgo).toBeLessThan(31);
  });

  it("skips drafts already cleared, so the count means something", async () => {
    await run();
    const arg = prismaMock.enrolmentDraft.updateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(arg.where).toHaveProperty("NOT");
  });

  it("reports how many were cleared", async () => {
    const body = await (await run()).json();
    expect(body.draftsCleared).toBe(4);
  });
});

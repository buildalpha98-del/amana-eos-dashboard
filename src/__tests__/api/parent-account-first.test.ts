/**
 * Identity comes from the account, not from the enrolment.
 *
 * The sweep after the magic-link fix found the same shape in several
 * more places: code that establishes who a parent IS by starting from
 * `EnrolmentSubmission`. That fails exactly the people who have an
 * account and no finished enrolment — the ones most likely to need
 * help — because their row doesn't exist yet.
 *
 * These cover the two that silently lost data rather than erroring.
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
  generateRequestId: () => "test-req-id",
}));

const parentRef: { enrolmentIds: string[]; accountId?: string } = {
  enrolmentIds: [],
  accountId: "acc-1",
};

vi.mock("@/lib/parent-auth", () => ({
  withParentAuth:
    (handler: (req: Request, ctx: unknown) => unknown) =>
    (req: Request, routeContext?: unknown) =>
      handler(req, {
        ...((routeContext as object) ?? {}),
        parent: {
          email: "aysha@example.com",
          name: "Aysha Khan",
          enrolmentIds: parentRef.enrolmentIds,
          accountId: parentRef.accountId,
        },
      }),
}));

import { PATCH } from "@/app/api/parent/account/route";

const save = (body: Record<string, unknown>) =>
  PATCH(
    createRequest("PATCH", "/api/parent/account", { body }),
    undefined as never,
  );

beforeEach(() => {
  vi.clearAllMocks();
  parentRef.enrolmentIds = [];
  parentRef.accountId = "acc-1";
  prismaMock.centreContact.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.parentAccount.update.mockResolvedValue({ id: "acc-1" });
});

describe("PATCH /api/parent/account — a parent with no finished enrolment", () => {
  it("lets them edit their own details", async () => {
    // It used to 404 "No enrolment found for this account" — refusing a
    // parent permission to correct their own name because identity was
    // read off an enrolment they haven't submitted.
    const res = await save({ firstName: "Aysha" });
    expect(res.status).toBeLessThan(400);
  });

  it("writes the change to the account", async () => {
    // `CentreContact` doesn't exist until staff approve the enrolment,
    // and ParentAccount was never written here at all — so the save
    // reported success and landed nowhere.
    await save({ firstName: "Ayesha", lastName: "Khan" });

    expect(prismaMock.parentAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "acc-1" },
        data: { firstName: "Ayesha", surname: "Khan" },
      }),
    );
  });

  it("maps lastName onto the account's surname column", async () => {
    // The API says lastName, the column says surname. Getting this
    // wrong would write nothing and still report success.
    await save({ lastName: "Nguyen" });
    const arg = prismaMock.parentAccount.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(arg.data).toEqual({ surname: "Nguyen" });
  });

  it("still syncs the contact rows when they exist", async () => {
    // The old sink stays — it is right for approved families.
    await save({ firstName: "Aysha" });
    expect(prismaMock.centreContact.updateMany).toHaveBeenCalled();
  });

  it("skips the account write when nothing account-shaped changed", async () => {
    await save({ occupation: "Nurse" });
    expect(prismaMock.parentAccount.update).not.toHaveBeenCalled();
    expect(prismaMock.centreContact.updateMany).toHaveBeenCalled();
  });

  it("doesn't fall over for a session with no account", async () => {
    // Pre-accounts magic-link sessions still exist in the wild.
    parentRef.accountId = undefined;
    const res = await save({ firstName: "Aysha" });

    expect(res.status).toBeLessThan(400);
    expect(prismaMock.parentAccount.update).not.toHaveBeenCalled();
  });
});

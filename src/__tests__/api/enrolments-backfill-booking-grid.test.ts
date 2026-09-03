/**
 * POST /api/enrolments/backfill-booking-grid
 *
 * The repair for families who enrolled through the portal before the
 * booking grid was translated (PR #254). Their session choices sat in
 * `bookingPrefs.sessions` where no reader looks, so the enrolment pack
 * printed blank, the centre's children list said "Not set", and approval
 * generated no bookings at all — the child never reached the roll.
 *
 * Merging the fix did nothing for them. This is what does.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

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
vi.mock("@/lib/room-resolver", () => ({
  stampRequiredRoomIds: (rows: unknown[]) => Promise.resolve(rows),
}));

import { POST } from "@/app/api/enrolments/backfill-booking-grid/route";

/** What the portal wrote before the fix: a grid answer nobody can read. */
const brokenPrefs = {
  bookingType: "permanent",
  startDate: "2020-01-01",
  sessions: { amanaAfternoons: ["Monday", "Tuesday"] },
  days: [],
};

function child(over: Record<string, unknown> = {}) {
  return {
    id: "child-1",
    firstName: "Mo",
    surname: "Khan",
    serviceId: "svc-1",
    bookingPrefs: brokenPrefs,
    enrolmentId: "enr-1",
    ...over,
  };
}

const run = (body: Record<string, unknown> = {}) =>
  POST(
    createRequest("POST", "/api/enrolments/backfill-booking-grid", { body }),
    undefined as never,
  );

/** The Child.update argument for a given child id. */
const updateFor = (id: string) =>
  prismaMock.child.update.mock.calls
    .map((c: [{ where: { id: string }; data: Record<string, unknown> }]) => c[0])
    .find((a: { where: { id: string } }) => a.where.id === id);

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.userServiceMembership.findMany.mockResolvedValue([]);
  prismaMock.child.findMany.mockResolvedValue([child()]);
  prismaMock.child.update.mockResolvedValue({});
  prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
    { id: "enr-1", status: "processed", children: [{ firstName: "Mo", bookingPrefs: brokenPrefs }] },
  ]);
  prismaMock.enrolmentSubmission.update.mockResolvedValue({});
  prismaMock.booking.createMany.mockResolvedValue({ count: 4 });
  mockSession({ id: "u-owner", name: "Owner", role: "owner" });
});

describe("who can run it", () => {
  it("lets an owner", async () => {
    expect((await run()).status).toBeLessThan(400);
  });

  it("refuses a director of service", async () => {
    // It rewrites booking preferences across every centre at once, so
    // it sits with the roles that already run the other backfills.
    mockSession({ id: "u-m", name: "Director", role: "member" });
    expect((await run()).status).toBe(403);
  });
});

describe("dry run", () => {
  it("is the default — no write without asking", async () => {
    // "The roll changed overnight and nobody knows why" is its own
    // kind of failure. Staff read the proposals first.
    const body = await (await run()).json();

    expect(body.dryRun).toBe(true);
    expect(prismaMock.child.update).not.toHaveBeenCalled();
    expect(prismaMock.booking.createMany).not.toHaveBeenCalled();
  });

  it("says what the child would actually get", async () => {
    const body = await (await run()).json();
    expect(body.proposals[0]).toMatchObject({
      childId: "child-1",
      childName: "Mo Khan",
      sessionTypes: ["asc"],
      days: { asc: ["monday", "tuesday"] },
      generatesBookings: true,
    });
  });

  it("shows the family's answer in their own words too", async () => {
    // So the reader can check the translation, not just trust it.
    const body = await (await run()).json();
    expect(body.proposals[0].sessions).toEqual({
      amanaAfternoons: ["Monday", "Tuesday"],
    });
  });

  it("flags a child who'd gain the session but not a roll", async () => {
    // A casual booking has no weekly pattern. The pack and the children
    // list improve; the roll is unchanged, and the report should say so.
    prismaMock.child.findMany.mockResolvedValue([
      child({ bookingPrefs: { ...brokenPrefs, bookingType: "casual" } }),
    ]);
    const body = await (await run()).json();
    expect(body.proposals[0].generatesBookings).toBe(false);
  });

  it("counts the ones still waiting on a service", async () => {
    // No service means no bookings can be generated for them yet —
    // that's the school-matching backfill's job, not this one's.
    prismaMock.child.findMany.mockResolvedValue([child({ serviceId: null })]);
    const body = await (await run()).json();
    expect(body.summary.awaitingService).toBe(1);
    expect(body.proposals[0].generatesBookings).toBe(false);
  });
});

describe("what it leaves alone", () => {
  it("a child whose preferences already read correctly", async () => {
    prismaMock.child.findMany.mockResolvedValue([
      child({
        bookingPrefs: { ...brokenPrefs, sessionTypes: ["asc"], days: { asc: ["monday"] } },
      }),
    ]);
    const body = await (await run({ apply: true })).json();
    expect(body.childrenRepaired).toBe(0);
    expect(prismaMock.child.update).not.toHaveBeenCalled();
  });

  it("a correction staff made by hand", async () => {
    // Overwriting from the original grid answer would undo their work.
    prismaMock.child.findMany.mockResolvedValue([
      child({
        bookingPrefs: { ...brokenPrefs, sessionTypes: ["bsc"], days: { bsc: ["friday"] } },
      }),
    ]);
    const body = await (await run({ apply: true })).json();
    expect(body.childrenRepaired).toBe(0);
  });

  it("a public-form enrolment that never had a grid answer", async () => {
    prismaMock.child.findMany.mockResolvedValue([
      child({ bookingPrefs: { bookingType: "permanent", days: { asc: ["monday"] } } }),
    ]);
    const body = await (await run()).json();
    expect(body.proposals).toEqual([]);
  });

  it("withdrawn children", async () => {
    // Repairing a roll they've left helps nobody.
    await run();
    const where = prismaMock.child.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: "withdrawn" });
  });
});

describe("apply", () => {
  it("writes the canonical shape onto the child", async () => {
    await run({ apply: true });
    const arg = updateFor("child-1")!;
    expect(arg.data).toEqual({
      bookingPrefs: expect.objectContaining({
        sessionTypes: ["asc"],
        days: { asc: ["monday", "tuesday"] },
      }),
    });
  });

  it("keeps what the family typed", async () => {
    await run({ apply: true });
    const prefs = (updateFor("child-1")!.data as { bookingPrefs: Record<string, unknown> })
      .bookingPrefs;
    expect(prefs.bookingType).toBe("permanent");
    expect(prefs.sessions).toEqual({ amanaAfternoons: ["Monday", "Tuesday"] });
  });

  it("repairs the submission blob the pack prints from", async () => {
    // A separate copy of the same answer. Fixing only the Child row
    // would leave the enrolment pack still saying nothing.
    await run({ apply: true });
    const arg = prismaMock.enrolmentSubmission.update.mock.calls[0][0] as {
      where: { id: string };
      data: { children: { bookingPrefs: Record<string, unknown> }[] };
    };
    expect(arg.where).toEqual({ id: "enr-1" });
    expect(arg.data.children[0].bookingPrefs.sessionTypes).toEqual(["asc"]);
  });

  it("generates the bookings approval never made", async () => {
    // This is the part a centre would actually notice.
    await run({ apply: true });
    const rows = prismaMock.booking.createMany.mock.calls[0][0].data;
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r: { sessionType: string }) => r.sessionType))).toEqual(
      new Set(["asc"]),
    );
  });

  it("doesn't book a family whose enrolment isn't approved yet", async () => {
    // Approval will generate them. Creating bookings for an unapproved
    // enrolment puts a child on the roll before anyone said yes.
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { id: "enr-1", status: "submitted", children: [] },
    ]);
    await run({ apply: true });
    expect(prismaMock.booking.createMany).not.toHaveBeenCalled();
    expect(prismaMock.child.update).toHaveBeenCalled();
  });

  it("doesn't book a child with no centre", async () => {
    prismaMock.child.findMany.mockResolvedValue([child({ serviceId: null })]);
    await run({ apply: true });
    expect(prismaMock.booking.createMany).not.toHaveBeenCalled();
  });

  it("skips duplicates, so a re-run can't double-book", async () => {
    await run({ apply: true });
    expect(prismaMock.booking.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it("repairs only the children staff picked", async () => {
    prismaMock.child.findMany.mockResolvedValue([
      child(),
      child({ id: "child-2", firstName: "Sara", enrolmentId: "enr-2" }),
    ]);
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { id: "enr-1", status: "submitted", children: [] },
      { id: "enr-2", status: "submitted", children: [] },
    ]);

    const body = await (await run({ apply: true, childIds: ["child-2"] })).json();
    expect(body.childrenRepaired).toBe(1);
    expect(updateFor("child-1")).toBeUndefined();
    expect(updateFor("child-2")).toBeDefined();
  });

  it("reports what it did", async () => {
    const body = await (await run({ apply: true })).json();
    expect(body).toMatchObject({
      dryRun: false,
      childrenRepaired: 1,
      submissionsRepaired: 1,
      bookingsCreated: 4,
    });
  });

  it("repairs siblings on one enrolment together", async () => {
    // The submission blob holds every sibling, so it must be written
    // once with all of them fixed rather than once per child.
    prismaMock.child.findMany.mockResolvedValue([
      child(),
      child({ id: "child-2", firstName: "Sara" }),
    ]);
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      {
        id: "enr-1",
        status: "submitted",
        children: [
          { firstName: "Mo", bookingPrefs: brokenPrefs },
          { firstName: "Sara", bookingPrefs: brokenPrefs },
        ],
      },
    ]);

    const body = await (await run({ apply: true })).json();
    expect(body.childrenRepaired).toBe(2);
    expect(prismaMock.enrolmentSubmission.update).toHaveBeenCalledTimes(1);
    const arg = prismaMock.enrolmentSubmission.update.mock.calls[0][0] as {
      data: { children: { bookingPrefs: { sessionTypes: string[] } }[] };
    };
    expect(arg.data.children.map((c) => c.bookingPrefs.sessionTypes)).toEqual([
      ["asc"],
      ["asc"],
    ]);
  });

  it("survives a submission whose children column is malformed", async () => {
    // Json column: the declared array type is a hope. A bad blob must
    // not cost the Child rows their repair.
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { id: "enr-1", status: "submitted", children: "corrupt" },
    ]);
    const body = await (await run({ apply: true })).json();
    expect(body.childrenRepaired).toBe(1);
    expect(body.submissionsRepaired).toBe(0);
  });
});

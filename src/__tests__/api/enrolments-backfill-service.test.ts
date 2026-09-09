/**
 * Backfilling a service onto enrolments that never got one.
 *
 * The behaviour that matters: it reports by default and NEVER writes a
 * row the matcher wasn't confident about. An ambiguous school name that
 * gets placed anyway puts a child at a centre they don't attend.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/api-error", () => {
  class ApiError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
    static badRequest(message = "Bad request") {
      return new ApiError(400, message);
    }
    static notFound(message = "Not found") {
      return new ApiError(404, message);
    }
    static forbidden(message = "Forbidden") {
      return new ApiError(403, message);
    }
  }
  return {
    ApiError,
    parseJsonBody: async (req: Request) => {
      try {
        return await req.json();
      } catch {
        throw ApiError.badRequest("Invalid or missing JSON body");
      }
    },
  };
});

vi.mock("@/lib/api-handler", async () => {
  const { NextResponse } = await import("next/server");
  return {
    handleApiError: vi.fn((_req: unknown, err: unknown) => {
      return NextResponse.json(
        { error: (err as any)?.message || "Internal error" },
        { status: (err as any)?.statusCode || 500 },
      );
    }),
  };
});

const upsertContacts = vi.fn(async () => ({ primary: null, secondary: null }));
vi.mock("@/lib/enrolment-parent-contacts", () => ({
  upsertContactsFromSubmission: (...a: unknown[]) => upsertContacts(...(a as [])),
}));

import { POST } from "@/app/api/enrolments/backfill-service/route";

const SERVICES = [
  { id: "svc-spring", name: "Amana OSHC Minaret Springvale" },
  { id: "svc-officer", name: "Amana OSHC Minaret Officer" },
  { id: "svc-taqwa", name: "Amana OSHC Taqwa" },
];

const ORPHANS = [
  {
    id: "ch-1",
    firstName: "Billy",
    surname: "Doe",
    schoolName: "Minaret College Springvale",
    bookingPrefs: null,
    enrolmentId: "es-1",
  },
  {
    // "Minaret" alone fits two campuses — the matcher refuses.
    id: "ch-2",
    firstName: "Sally",
    surname: "Roe",
    schoolName: "Minaret",
    bookingPrefs: null,
    enrolmentId: "es-2",
  },
  {
    id: "ch-3",
    firstName: "Ali",
    surname: "Khan",
    schoolName: null,
    bookingPrefs: null,
    enrolmentId: "es-3",
  },
];

function seed() {
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.service.findMany.mockResolvedValue(SERVICES);
  prismaMock.child.findMany.mockResolvedValue(ORPHANS);
  prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
    { id: "es-1", status: "submitted", serviceId: null, primaryParent: { surname: "Doe" }, secondaryParent: null },
    { id: "es-2", status: "submitted", serviceId: null, primaryParent: { surname: "Roe" }, secondaryParent: null },
    { id: "es-3", status: "submitted", serviceId: null, primaryParent: { surname: "Khan" }, secondaryParent: null },
  ]);
  prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
  prismaMock.child.update.mockResolvedValue({ id: "ch-1" });
  prismaMock.child.count.mockResolvedValue(0);
  prismaMock.enrolmentSubmission.update.mockResolvedValue({ id: "es-1" });
}

const call = (body: unknown) =>
  POST(
    createRequest("POST", "/api/enrolments/backfill-service", { body: body as never }),
    undefined as never,
  );

describe("POST /api/enrolments/backfill-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    seed();
  });

  it("rejects an unauthenticated caller", async () => {
    mockNoSession();
    expect((await call({})).status).toBe(401);
  });

  it("reports without writing anything by default", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    const res = await call({});
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.dryRun).toBe(true);
    expect(body.summary).toMatchObject({
      total: 3,
      matched: 1,
      ambiguous: 1,
      noSchool: 1,
    });
    // Nothing written on a dry run — that's the whole point of it.
    expect(prismaMock.child.update).not.toHaveBeenCalled();
    expect(prismaMock.enrolmentSubmission.update).not.toHaveBeenCalled();
  });

  it("names the child, school and destination in each proposal", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    const body = await (await call({})).json();
    const matched = body.proposals.find((p: any) => p.reason === "matched");
    expect(matched).toMatchObject({
      childName: "Billy Doe",
      familyName: "Doe",
      serviceId: "svc-spring",
      serviceName: "Amana OSHC Minaret Springvale",
    });
  });

  it("applies ONLY the confident matches", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    const res = await call({ apply: true });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.assigned).toBe(1);
    expect(prismaMock.child.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.child.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ch-1" },
        data: { serviceId: "svc-spring" },
      }),
    );
    // The ambiguous and school-less rows come back for a human.
    expect(body.remaining).toHaveLength(2);
  });

  it("honours a narrowed selection", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    // Staff unticked the only match — nothing should be written.
    const body = await (await call({ apply: true, childIds: ["ch-2"] })).json();
    expect(body.assigned).toBe(0);
    expect(prismaMock.child.update).not.toHaveBeenCalled();
  });

  it("creates the family's billing contacts when it places a child", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    await call({ apply: true });
    // A child on a roll whose family has no CentreContact can be
    // rostered but never invoiced.
    expect(upsertContacts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "es-1", serviceId: "svc-spring" }),
    );
  });

  it("leaves the submission alone while a sibling is elsewhere", async () => {
    mockSession({ id: "u-1", name: "Test", role: "owner" });
    // One sibling still sits on a different service.
    prismaMock.child.count.mockResolvedValue(1);
    await call({ apply: true });
    expect(prismaMock.enrolmentSubmission.update).not.toHaveBeenCalled();
    // The child itself is still placed — only the submission stamp waits.
    expect(prismaMock.child.update).toHaveBeenCalledTimes(1);
  });
});

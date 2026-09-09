/**
 * Editing a family's account, and moving the household to a service.
 *
 * The email is the parent's LOGIN, so the interesting cases are the ones
 * that would lock a family out: normalising it the way sign-up does, and
 * refusing an address another family already holds.
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

import { PATCH } from "@/app/api/families/[id]/route";
import { POST as moveService } from "@/app/api/families/[id]/service/route";

const ctx = (id = "fam-1") => ({ params: Promise.resolve({ id }) }) as never;

describe("PATCH /api/families/[id] — account details", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.parentAccount.update.mockResolvedValue({ familyName: "Doe" });
  });

  function seedAccount(over: Record<string, unknown> = {}) {
    prismaMock.parentAccount.findUnique.mockImplementation((args: any) => {
      // The uniqueness probe looks up by email; the load looks up by id.
      if (args?.where?.email) return Promise.resolve(null);
      return Promise.resolve({
        billingFrequency: null,
        email: "jane@example.com",
        deactivatedAt: null,
        ...over,
      });
    });
  }

  it("rejects an unauthenticated caller", async () => {
    mockNoSession();
    const res = await PATCH(
      createRequest("PATCH", "/api/families/fam-1", { body: { surname: "Doe" } }),
      ctx(),
    );
    expect(res.status).toBe(401);
  });

  it("saves the account holder's name", async () => {
    mockSession({ id: "u-1", name: "T", role: "owner" });
    seedAccount();
    const res = await PATCH(
      createRequest("PATCH", "/api/families/fam-1", {
        body: { firstName: "Jane", surname: "Doe" },
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.parentAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ firstName: "Jane", surname: "Doe" }),
      }),
    );
  });

  it("normalises a new login email the way sign-up does", async () => {
    mockSession({ id: "u-1", name: "T", role: "owner" });
    seedAccount();
    await PATCH(
      createRequest("PATCH", "/api/families/fam-1", {
        body: { email: "  NEW@Example.COM " },
      }),
      ctx(),
    );
    // Stored raw, the family would type what they were given and the
    // lookup would miss.
    expect(prismaMock.parentAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "new@example.com" }),
      }),
    );
  });

  it("refuses an email another family already uses", async () => {
    mockSession({ id: "u-1", name: "T", role: "owner" });
    prismaMock.parentAccount.findUnique.mockImplementation((args: any) =>
      args?.where?.email
        ? Promise.resolve({ id: "someone-else" })
        : Promise.resolve({
            billingFrequency: null,
            email: "jane@example.com",
            deactivatedAt: null,
          }),
    );
    const res = await PATCH(
      createRequest("PATCH", "/api/families/fam-1", {
        body: { email: "taken@example.com" },
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.parentAccount.update).not.toHaveBeenCalled();
  });

  it("leaves the email alone when it hasn't actually changed", async () => {
    mockSession({ id: "u-1", name: "T", role: "owner" });
    seedAccount();
    await PATCH(
      createRequest("PATCH", "/api/families/fam-1", {
        body: { email: "JANE@example.com", surname: "Doe" },
      }),
      ctx(),
    );
    const data = (prismaMock.parentAccount.update as any).mock.calls[0][0].data;
    expect(data.email).toBeUndefined();
  });

  it("records who switched access off, and why", async () => {
    mockSession({ id: "u-9", name: "T", role: "owner" });
    seedAccount();
    await PATCH(
      createRequest("PATCH", "/api/families/fam-1", {
        body: { deactivated: true, deactivatedReason: "Left Dec 2026" },
      }),
      ctx(),
    );
    const data = (prismaMock.parentAccount.update as any).mock.calls[0][0].data;
    expect(data.deactivatedAt).toBeInstanceOf(Date);
    expect(data.deactivatedById).toBe("u-9");
    expect(data.deactivatedReason).toBe("Left Dec 2026");
  });

  it("clears the whole deactivation when switching access back on", async () => {
    mockSession({ id: "u-9", name: "T", role: "owner" });
    seedAccount({ deactivatedAt: new Date() });
    await PATCH(
      createRequest("PATCH", "/api/families/fam-1", {
        body: { deactivated: false },
      }),
      ctx(),
    );
    const data = (prismaMock.parentAccount.update as any).mock.calls[0][0].data;
    // A stale reason left behind reads as "still switched off" to the
    // next person who opens the page.
    expect(data).toMatchObject({
      deactivatedAt: null,
      deactivatedById: null,
      deactivatedReason: null,
    });
  });
});

describe("POST /api/families/[id]/service", () => {
  const ENROLMENTS = [
    {
      id: "es-1",
      status: "processed",
      serviceId: "svc-1",
      primaryParent: { email: "Jane@Example.com " },
      secondaryParent: null,
      childRecords: [
        { id: "ch-1", status: "active", serviceId: "svc-1", bookingPrefs: null },
        { id: "ch-2", status: "active", serviceId: "svc-1", bookingPrefs: null },
      ],
    },
    {
      // Another family entirely — must not be swept up by the email join.
      id: "es-other",
      status: "processed",
      serviceId: "svc-1",
      primaryParent: { email: "someone@else.com" },
      secondaryParent: null,
      childRecords: [
        { id: "ch-x", status: "active", serviceId: "svc-1", bookingPrefs: null },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.parentAccount.findUnique.mockResolvedValue({
      id: "fam-1",
      email: "jane@example.com",
      familyName: "Doe",
    });
    prismaMock.service.findUnique.mockResolvedValue({
      id: "svc-2",
      name: "Amana OSHC Minaret Officer",
      status: "active",
    });
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue(ENROLMENTS);
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.child.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.enrolmentSubmission.update.mockResolvedValue({ id: "es-1" });
  });

  it("moves the children and the billing contacts together", async () => {
    mockSession({ id: "u-1", name: "T", role: "owner" });
    const res = await moveService(
      createRequest("POST", "/api/families/fam-1/service", {
        body: { serviceId: "svc-2" },
      }),
      ctx(),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.childrenMoved).toBe(2);

    expect(prismaMock.child.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["ch-1", "ch-2"] } },
        data: { serviceId: "svc-2" },
      }),
    );
    // Without this the household is on the new roll and un-invoiceable.
    expect(upsertContacts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "es-1", serviceId: "svc-2" }),
    );
    // The other family's enrolment must not be touched.
    expect(upsertContacts).toHaveBeenCalledTimes(1);
  });

  it("matches the family's enrolments case-insensitively", async () => {
    mockSession({ id: "u-1", name: "T", role: "owner" });
    // The stored blob is " Jane@Example.com " — a strict JSON path filter
    // would miss it and report the family has no children.
    const res = await moveService(
      createRequest("POST", "/api/families/fam-1/service", {
        body: { serviceId: "svc-2" },
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
  });

  it("leaves the submission unstamped when a sibling stays behind", async () => {
    mockSession({ id: "u-1", name: "T", role: "owner" });
    await moveService(
      createRequest("POST", "/api/families/fam-1/service", {
        body: { serviceId: "svc-2", childIds: ["ch-1"] },
      }),
      ctx(),
    );
    expect(prismaMock.enrolmentSubmission.update).not.toHaveBeenCalled();
    expect(prismaMock.child.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["ch-1"] } } }),
    );
  });

  it("refuses a child from another family", async () => {
    mockSession({ id: "u-1", name: "T", role: "owner" });
    const res = await moveService(
      createRequest("POST", "/api/families/fam-1/service", {
        body: { serviceId: "svc-2", childIds: ["ch-x"] },
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.child.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a closed service", async () => {
    mockSession({ id: "u-1", name: "T", role: "owner" });
    prismaMock.service.findUnique.mockResolvedValue({
      id: "svc-2",
      name: "Closed centre",
      status: "inactive",
    });
    const res = await moveService(
      createRequest("POST", "/api/families/fam-1/service", {
        body: { serviceId: "svc-2" },
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });
});

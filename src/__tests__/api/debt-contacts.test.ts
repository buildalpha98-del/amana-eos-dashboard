/**
 * Logging that a family was chased about money.
 *
 * The point of the log is that "nobody has contacted this family" is
 * trustworthy, so the tests pin the things that would make it lie: a
 * chase dated in the future sorting to the top, and a coordinator
 * reading or writing against a centre they don't run.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
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

import { GET, POST } from "@/app/api/billing/debt-contacts/route";

describe("/api/billing/debt-contacts", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.familyDebtContact.create.mockResolvedValue({ id: "dc-1" });
    prismaMock.familyDebtContact.findMany.mockResolvedValue([]);
  });

  it("logs a chase against the caller", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    const res = await POST(
      createRequest("POST", "/x", {
        body: { contactId: "c-1", method: "call", outcome: "Promised Friday" },
      }),
    );
    expect(res.status).toBe(201);
    const data = prismaMock.familyDebtContact.create.mock.calls[0][0].data;
    expect(data.method).toBe("call");
    expect(data.byId).toBe("u-1");
  });

  it("refuses a chase dated in the future", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    const tomorrow = new Date(Date.now() + 86400_000).toISOString();
    const res = await POST(
      createRequest("POST", "/x", {
        body: { contactId: "c-1", method: "call", contactedAt: tomorrow },
      }),
    );
    // It would sort to the top and make "last contacted" read as done.
    expect(res.status).toBe(400);
    expect(prismaMock.familyDebtContact.create).not.toHaveBeenCalled();
  });

  it("accepts a chase made yesterday", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    const yesterday = new Date(Date.now() - 86400_000).toISOString();
    const res = await POST(
      createRequest("POST", "/x", {
        body: { contactId: "c-1", method: "email", contactedAt: yesterday },
      }),
    );
    expect(res.status).toBe(201);
  });

  it("rejects a method that isn't one of ours", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    const res = await POST(
      createRequest("POST", "/x", {
        body: { contactId: "c-1", method: "carrier pigeon" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("a coordinator can't log against another centre's family", async () => {
    mockSession({ id: "u-1", name: "Coord", role: "member", serviceId: "svc-1" });
    prismaMock.centreContact.findUnique.mockResolvedValue({
      serviceId: "svc-OTHER",
    });
    const res = await POST(
      createRequest("POST", "/x", { body: { contactId: "c-1", method: "call" } }),
    );
    expect(res.status).toBe(404);
    expect(prismaMock.familyDebtContact.create).not.toHaveBeenCalled();
  });

  it("a coordinator can't read another centre's chase history", async () => {
    mockSession({ id: "u-1", name: "Coord", role: "member", serviceId: "svc-1" });
    prismaMock.centreContact.findUnique.mockResolvedValue({
      serviceId: "svc-OTHER",
    });
    const res = await GET(
      createRequest("GET", "/api/billing/debt-contacts?contactId=c-1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns a family's history newest first", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    await GET(createRequest("GET", "/api/billing/debt-contacts?contactId=c-1"));
    const args = prismaMock.familyDebtContact.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ contactId: "c-1" });
    expect(args.orderBy).toEqual({ contactedAt: "desc" });
  });

  it("needs a family to log against", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    const res = await GET(createRequest("GET", "/api/billing/debt-contacts"));
    expect(res.status).toBe(400);
  });
});

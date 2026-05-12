import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
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

vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn((v: string) => `encrypted:${v}`),
}));

import { PATCH } from "@/app/api/users/[id]/profile/route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true, id: "t-1" });
  prismaMock.user.update.mockResolvedValue({ id: "t-1", tags: [] } as never);
});

describe("PATCH /api/users/[id]/profile — tags", () => {
  it("normalises and dedupes tags before writing (NSW, nsw, ' nsw ' → ['nsw'])", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    const res = await PATCH(
      createRequest("PATCH", "/api/users/t-1/profile", {
        body: { tags: ["NSW", "nsw", "  nsw  "] },
      }),
      ctx("t-1") as never,
    );
    expect(res.status).toBe(200);
    const updateCall = prismaMock.user.update.mock.calls[0][0];
    expect(updateCall.data.tags).toEqual(["nsw"]);
  });

  it("replaces the array atomically (not append) so removing works", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    await PATCH(
      createRequest("PATCH", "/api/users/t-1/profile", {
        body: { tags: ["lead"] },
      }),
      ctx("t-1") as never,
    );
    const updateCall = prismaMock.user.update.mock.calls[0][0];
    // Prisma `data: { tags: [...] }` replaces; we explicitly do NOT
    // emit a `{ push: ... }` shape here so removes work via the same
    // endpoint.
    expect(updateCall.data.tags).toEqual(["lead"]);
  });

  it("returns 403 when a non-admin viewer tries to set tags on someone else", async () => {
    mockSession({ id: "other-1", name: "Other", role: "staff" });
    const res = await PATCH(
      createRequest("PATCH", "/api/users/t-1/profile", {
        body: { tags: ["nsw"] },
      }),
      ctx("t-1") as never,
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when a staff viewer tries to set tags on themselves (not in STAFF_SELF_FIELDS)", async () => {
    mockSession({ id: "t-1", name: "Self", role: "staff" });
    const res = await PATCH(
      createRequest("PATCH", "/api/users/t-1/profile", {
        body: { tags: ["nsw"] },
      }),
      ctx("t-1") as never,
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const res = await PATCH(
      createRequest("PATCH", "/api/users/t-1/profile", {
        body: { tags: ["nsw"] },
      }),
      ctx("t-1") as never,
    );
    expect(res.status).toBe(401);
  });
});

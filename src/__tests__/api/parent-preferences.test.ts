/**
 * "Add Amana to your phone" dismissal.
 *
 * The point of the endpoint is that dismissal survives a change of
 * device. localStorage doesn't — it's per-device, per-browser, and gone
 * the moment anyone clears their history — so the flag lives on the
 * account and these tests pin that down.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    parentAccount: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

// Stands in for the real wrapper, including its ApiError → response
// translation — without that a thrown 404 escapes as a test failure
// rather than the 404 a client would actually receive.
vi.mock("@/lib/parent-auth", () => ({
  withParentAuth:
    (
      handler: (
        req: Request,
        ctx: { parent: { email: string } },
      ) => Promise<Response>,
    ) =>
    async (req: Request) => {
      try {
        return await handler(req, { parent: { email: "Jane@Example.COM " } });
      } catch (err) {
        const status =
          (err as { status?: number })?.status ?? 500;
        return Response.json(
          { error: (err as Error)?.message ?? "Error" },
          { status },
        );
      }
    },
}));

vi.mock("@/lib/api-error", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-error")>(
    "@/lib/api-error",
  );
  return actual;
});

import { prisma } from "@/lib/prisma";
import { GET, POST } from "@/app/api/parent/preferences/route";

const mockPrisma = prisma as unknown as {
  parentAccount: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

/** Cast at the boundary: the route types its request as NextRequest,
 *  but nothing in it uses anything beyond the Fetch Request surface. */
const req = (body?: unknown) =>
  new Request("http://localhost/api/parent/preferences", {
    method: body ? "POST" : "GET",
    ...(body ? { body: JSON.stringify(body) } : {}),
    headers: { "content-type": "application/json" },
  }) as unknown as import("next/server").NextRequest;

describe("/api/parent/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.parentAccount.update.mockResolvedValue({ id: "acc-1" });
  });

  it("reports not-dismissed for a fresh account", async () => {
    mockPrisma.parentAccount.findUnique.mockResolvedValue({
      appInstallCardDismissedAt: null,
    });
    const res = await GET(req());
    expect((await res.json()).appInstallCardDismissed).toBe(false);
  });

  it("reports dismissed once the timestamp is set", async () => {
    mockPrisma.parentAccount.findUnique.mockResolvedValue({
      appInstallCardDismissedAt: new Date(),
    });
    const res = await GET(req());
    expect((await res.json()).appInstallCardDismissed).toBe(true);
  });

  it("looks the account up by NORMALISED email", async () => {
    mockPrisma.parentAccount.findUnique.mockResolvedValue(null);
    await GET(req());
    // The JWT carries whatever case the family typed; the column is
    // always lowercased, so a raw lookup silently misses and the card
    // reappears forever.
    expect(mockPrisma.parentAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "jane@example.com" } }),
    );
  });

  it("stamps a timestamp when dismissed", async () => {
    mockPrisma.parentAccount.findUnique.mockResolvedValue({ id: "acc-1" });
    const res = await POST(req({ appInstallCardDismissed: true }));
    expect(res.status).toBe(200);
    const data = mockPrisma.parentAccount.update.mock.calls[0][0].data;
    expect(data.appInstallCardDismissedAt).toBeInstanceOf(Date);
  });

  it("clears it when un-dismissed", async () => {
    mockPrisma.parentAccount.findUnique.mockResolvedValue({ id: "acc-1" });
    await POST(req({ appInstallCardDismissed: false }));
    const data = mockPrisma.parentAccount.update.mock.calls[0][0].data;
    expect(data.appInstallCardDismissedAt).toBeNull();
  });

  it("404s rather than creating an account from a stale token", async () => {
    mockPrisma.parentAccount.findUnique.mockResolvedValue(null);
    const res = await POST(req({ appInstallCardDismissed: true }));
    expect(res.status).toBe(404);
    expect(mockPrisma.parentAccount.update).not.toHaveBeenCalled();
  });
});

/**
 * Centre stock & resources list (2026-10-21): the centre keeps it, "Send
 * stocktake" tells head office what's running low — replacing the email.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 9, resetIn: 0 })) }));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "t",
}));
const notify = vi.hoisted(() => ({ notifyUsers: vi.fn(() => Promise.resolve(1)) }));
vi.mock("@/lib/notify-user", () => notify);

import { GET, POST } from "@/app/api/services/[id]/stock/route";
import { PATCH, DELETE } from "@/app/api/services/[id]/stock/[itemId]/route";
import { POST as SUBMIT } from "@/app/api/services/[id]/stock/submit/route";

const ctx = (id: string, itemId?: string) => ({ params: Promise.resolve({ id, ...(itemId ? { itemId } : {}) }) });

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  mockSession({ id: "ed", name: "Sarah Awad", role: "staff", serviceId: "svc-a" });
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.user.findMany.mockResolvedValue([{ id: "ho1" }, { id: "ho2" }]);
  prismaMock.service.findUnique.mockResolvedValue({ name: "Amana OSHC MFIS Greenacre" });
  prismaMock.stockItem.findMany.mockResolvedValue([
    { item: "Glue sticks", qtyOnHand: 4, reorderAt: 10, unit: "sticks" },
    { item: "Soccer balls", qtyOnHand: 6, reorderAt: 2, unit: null },
  ]);
  prismaMock.stockItem.upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) => Promise.resolve({ id: "s1", ...create }));
  prismaMock.stockItem.updateMany.mockResolvedValue({ count: 2 });
});

describe("centre stock list", () => {
  it("anyone at the centre can read and add — not another centre", async () => {
    expect((await GET(createRequest("GET", "/x"), ctx("svc-a"))).status).toBe(200);
    const res = await POST(createRequest("POST", "/x", { body: { item: "Glue sticks", qtyOnHand: 4, reorderAt: 10 } }), ctx("svc-a"));
    expect(res.status).toBe(201);
    expect(prismaMock.stockItem.upsert.mock.calls[0][0].where).toEqual({ serviceId_item: { serviceId: "svc-a", item: "Glue sticks" } });
    expect((await GET(createRequest("GET", "/x"), ctx("svc-b"))).status).toBe(403);
  });

  it("won't change or delete an item that belongs to another centre", async () => {
    prismaMock.stockItem.findUnique.mockResolvedValue({ id: "s9", serviceId: "svc-b" });
    expect((await PATCH(createRequest("PATCH", "/x", { body: { qtyOnHand: 1 } }), ctx("svc-a", "s9"))).status).toBe(404);
    expect((await DELETE(createRequest("DELETE", "/x"), ctx("svc-a", "s9"))).status).toBe(404);
    expect(prismaMock.stockItem.update).not.toHaveBeenCalled();
    expect(prismaMock.stockItem.delete).not.toHaveBeenCalled();
  });

  it("sending the stocktake stamps today's count and tells head office what's low", async () => {
    const res = await SUBMIT(createRequest("POST", "/x"), ctx("svc-a"));
    expect(await res.json()).toEqual({ counted: 2, toReorder: 1 });
    expect(prismaMock.stockItem.updateMany.mock.calls[0][0].where).toEqual({ serviceId: "svc-a" });
    expect(notify.notifyUsers).toHaveBeenCalledWith(
      expect.anything(),
      ["ho1", "ho2"],
      expect.objectContaining({ title: "MFIS Greenacre sent their stocktake", body: expect.stringMatching(/1 to reorder: Glue sticks/) }),
    );
  });

  it("an empty list can't be sent", async () => {
    prismaMock.stockItem.updateMany.mockResolvedValue({ count: 0 });
    expect((await SUBMIT(createRequest("POST", "/x"), ctx("svc-a"))).status).toBe(400);
    expect(notify.notifyUsers).not.toHaveBeenCalled();
  });
});

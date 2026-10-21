/**
 * Program materials orders (Daniel, 21 Oct 2026): the spreadsheet's routing
 * rules, the Cowork push, and a checked-out cart becoming budget spend.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "rid",
}));
vi.mock("@/lib/budget-helpers", () => ({ recalcFinancialsForWeek: vi.fn(async () => undefined) }));
vi.mock("@/app/api/_lib/auth", () => ({
  authenticateCowork: vi.fn(async () => null),
  setVersionHeaders: (r: Response) => r,
}));

import { recordCartSpend, routeLine } from "@/lib/materials-orders";
import { POST } from "@/app/api/cowork/materials/route";

describe("routing an item from the centre's answer", () => {
  it("Yes → in stock, Check → follow up, No → its route, nothing → awaiting", () => {
    expect(routeLine("yes", "hq_order")).toBe("in_stock");
    expect(routeLine("check", "hq_order")).toBe("follow_up");
    expect(routeLine("no", "local_buy")).toBe("local_buy");
    expect(routeLine("no", "hq_order")).toBe("hq_order");
    expect(routeLine("no", "follow_up")).toBe("follow_up");
    expect(routeLine(null, "hq_order")).toBe("awaiting_reply");
  });
});

describe("a checked-out cart", () => {
  beforeEach(() => vi.clearAllMocks());
  it("records its total once as program materials spend", async () => {
    prismaMock.materialsCart.findUnique.mockResolvedValue({
      id: "k1",
      serviceId: "svc",
      retailer: "Kmart",
      total: 65.25,
      budgetItemId: null,
      checkedOutAt: new Date("2026-10-13T03:00:00Z"),
      round: { title: "Term 4 materials" },
    });
    prismaMock.budgetItem.create.mockResolvedValue({ id: "b1", date: new Date("2026-10-13T00:00:00Z") });
    prismaMock.materialsCart.updateMany.mockResolvedValue({ count: 1 });
    await recordCartSpend("k1", "u1");
    expect(prismaMock.budgetItem.create.mock.calls[0][0].data).toMatchObject({
      serviceId: "svc",
      amount: 65.25,
      category: "program_materials",
      name: "Kmart materials — Term 4 materials",
    });
  });
  it("never twice", async () => {
    prismaMock.materialsCart.findUnique.mockResolvedValue({ id: "k1", serviceId: "svc", retailer: "Kmart", total: 65.25, budgetItemId: "b1", checkedOutAt: null, round: { title: "T4" } });
    await recordCartSpend("k1", "u1");
    expect(prismaMock.budgetItem.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/cowork/materials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.service.findMany.mockResolvedValue([{ id: "svc-aia", code: "AIA-COB" }]);
    prismaMock.materialsOrderRound.upsert.mockResolvedValue({ id: "r1" });
    prismaMock.materialsOrderCentre.upsert.mockResolvedValue({});
    prismaMock.materialsOrderLine.upsert.mockResolvedValue({});
    prismaMock.materialsCart.upsert.mockResolvedValue({ id: "k1", status: "ready" });
  });
  it("upserts the round, centres, routed lines and carts; reports unknown centres", async () => {
    const res = await POST(
      createRequest("POST", "/api/cowork/materials", {
        body: {
          round: { key: "2026-T4-w1-4", title: "Term 4 materials", programStart: "2026-10-12", programEnd: "2026-11-06" },
          centres: [{ serviceCode: "AIA-COB", replyStatus: "replied" }],
          lines: [
            { serviceCode: "AIA-COB", ref: "w2-spray-bottle", week: 2, item: "Spray bottle", qty: 1, ifMissing: "hq_order", centreHasIt: "no" },
            { serviceCode: "NOPE", ref: "x", item: "x" },
          ],
          carts: [{ serviceCode: "AIA-COB", retailer: "Kmart", status: "ready", lineCount: 10, total: 65.25 }],
        },
      }),
    );
    const body = await res.json();
    expect(body).toMatchObject({ roundId: "r1", lines: 1, carts: 1, unknownServiceCodes: ["NOPE"] });
    const line = prismaMock.materialsOrderLine.upsert.mock.calls[0][0];
    expect(line.create).toMatchObject({ item: "Spray bottle", action: "hq_order", centreHasIt: "no" });
  });
});

/**
 * A statement can bill any room the centre has.
 *
 * Stage 2 of docs/rooms-migration-plan.md, the billing half. Both
 * statement routes carried `z.enum(["bsc","asc","vc"])` on their line
 * items. That was never a labelling problem: a booking in an extra room
 * could not reach a statement at all, so the family was not billed for
 * it — while the roll, the booking form and the casual spots had all
 * already learned to offer that room.
 *
 * The other half is the name. Three separate hardcoded `{bsc:"BSC"}`
 * maps decided what a line said — in the PDF a family keeps, in the
 * staff panel, and in the generated description — so a line for an
 * extra room read as its slot code.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { _clearRoomNameCache } from "@/lib/room-names";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
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
vi.mock("@/lib/notifications/billing", () => ({
  sendStatementIssuedNotification: vi.fn(),
  sendPaymentReceivedNotification: vi.fn(),
  sendOverdueStatementNotification: vi.fn(),
}));
vi.mock("@/lib/billing/statement-pdf", () => ({
  generateStatementPdf: vi.fn().mockResolvedValue("https://blob/test.pdf"),
}));

import { POST } from "@/app/api/billing/statements/route";
import { GET as DETAIL } from "@/app/api/billing/statements/[id]/route";

const line = (sessionType: string) => ({
  childId: "child-1",
  date: "2026-03-01",
  sessionType,
  description: "Homework Club",
  grossFee: 30,
  ccsHours: 10,
  ccsRate: 1.2,
  ccsAmount: 12,
  gapAmount: 18,
});

const body = (sessionType: string) => ({
  contactId: "contact-1",
  serviceId: "svc-1",
  periodStart: "2026-03-01",
  periodEnd: "2026-03-31",
  lineItems: [line(sessionType)],
});

const create = (sessionType: string) =>
  POST(
    createRequest("POST", "/api/billing/statements", {
      body: body(sessionType),
    }),
    undefined as never,
  );

beforeEach(() => {
  _clearUserActiveCache();
  _clearRoomNameCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.statement.create.mockResolvedValue({ id: "stmt-1" });
  mockSession({ id: "u-1", name: "Admin", role: "admin" });
});

describe("POST /api/billing/statements — any room", () => {
  it("accepts a line for a room the enum called an extra", async () => {
    // The bug this closes. A centre running a fourth room could take
    // the booking and never bill it.
    const res = await create("extra1");
    expect(res.status).toBeLessThan(400);
  });

  it("still accepts the core programmes", async () => {
    expect((await create("asc")).status).toBeLessThan(400);
  });

  it("rejects something that isn't a session type at all", async () => {
    expect((await create("lunchtime")).status).toBe(400);
  });

  it("stamps the resolved roomId on the line", async () => {
    // The line has carried a NOT NULL roomId since Stage 1 — this
    // checks the widened schema didn't route around the resolver.
    await create("extra1");
    const arg = prismaMock.statement.create.mock.calls[0][0] as {
      data: { lineItems: { create: Array<{ roomId: string }> } };
    };
    expect(arg.data.lineItems.create[0].roomId).toBeTruthy();
  });
});

describe("GET /api/billing/statements/[id] — naming the room", () => {
  it("joins the room so a line can be named without the JSON", async () => {
    // Every screen used its own {bsc:"BSC"} map, which is exactly why
    // an extra room's line rendered as its slot code.
    prismaMock.statement.findUnique.mockResolvedValue({
      id: "stmt-1",
      serviceId: "svc-1",
      lineItems: [],
      payments: [],
    });

    await DETAIL(
      createRequest("GET", "/api/billing/statements/stmt-1"),
      { params: Promise.resolve({ id: "stmt-1" }) },
    );

    const arg = prismaMock.statement.findUnique.mock.calls[0][0] as {
      include: { lineItems: { include: Record<string, unknown> } };
    };
    expect(arg.include.lineItems.include).toHaveProperty("room");
  });
});

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

import {
  TERM_PACK,
  termPackMarker,
  createTermPackForService,
  notifyTermPackCreated,
} from "@/lib/term-pack";
import { DEFAULT_CHECKLISTS } from "@/lib/creative-request/constants";
import { logger } from "@/lib/logger";

const service = { id: "svc-1", name: "Test Centre" };

/** Route creativeRequest.count: marker checks (where.purpose) vs
 *  request-number generation (where.requestNumber, count-based). */
function routeCounts({ packedServiceIds = [] as string[] } = {}) {
  prismaMock.creativeRequest.count.mockImplementation(
    async (args: { where: { purpose?: unknown; serviceId?: string } }) => {
      if (args?.where?.purpose) {
        return packedServiceIds.includes(args.where.serviceId as string) ? 1 : 0;
      }
      // Number generation: count of already-created requests this year.
      return prismaMock.creativeRequest.create.mock.calls.length;
    },
  );
}

function createArgs() {
  return prismaMock.creativeRequest.create.mock.calls.map(
    (c: Array<{ data: Record<string, unknown> }>) => c[0].data,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Wednesday 2026-07-01 UTC — business-day maths below depend on this.
  vi.setSystemTime(new Date("2026-07-01T00:00:00.000Z"));
  routeCounts();
  prismaMock.creativeRequest.create.mockResolvedValue({ id: "req-x" });
  prismaMock.user.findMany.mockResolvedValue([{ id: "mkt-1" }, { id: "mkt-2" }]);
  prismaMock.userNotification.createMany.mockResolvedValue({ count: 2 });
});

afterAll(() => {
  vi.useRealTimers();
});

describe("termPackMarker", () => {
  it("formats as [auto:term-pack:<year>-T<term>]", () => {
    expect(termPackMarker(2026, 4)).toBe("[auto:term-pack:2026-T4]");
    expect(termPackMarker(2027, 1)).toBe("[auto:term-pack:2027-T1]");
  });
});

describe("TERM_PACK", () => {
  it("defines the v1 pack: poster/flyer 4wk, social_tile/email_header 3wk", () => {
    expect(TERM_PACK.map((p) => [p.type, p.weeksBefore])).toEqual([
      ["poster", 4],
      ["flyer", 4],
      ["social_tile", 3],
      ["email_header", 3],
    ]);
    expect(TERM_PACK[0].title(3, 2026, "Test Centre")).toBe(
      "Term 3 welcome poster — Test Centre",
    );
    expect(TERM_PACK[1].title(3, 2026, "Test Centre")).toBe(
      "Term 3 program flyer — Test Centre",
    );
    expect(TERM_PACK[2].title(3, 2026, "Test Centre")).toBe(
      "Term 3 countdown tiles — Test Centre",
    );
    expect(TERM_PACK[3].title(3, 2026, "Test Centre")).toBe(
      "Term 3 newsletter headers — Test Centre",
    );
  });
});

describe("createTermPackForService", () => {
  it("skips (returns 0) when the service already has the marker", async () => {
    routeCounts({ packedServiceIds: ["svc-1"] });

    const created = await createTermPackForService(prismaMock, {
      year: 2026,
      term: 4,
      termStart: new Date("2026-10-13T00:00:00.000Z"),
      service,
      requestedById: "mkt-1",
    });

    expect(created).toBe(0);
    expect(prismaMock.creativeRequest.create).not.toHaveBeenCalled();
    // The marker check is scoped to THIS service.
    const countArg = prismaMock.creativeRequest.count.mock.calls[0][0];
    expect(countArg.where.serviceId).toBe("svc-1");
    expect(countArg.where.purpose).toEqual({ contains: "[auto:term-pack:2026-T4]" });
  });

  it("creates all 4 requests sequentially with count-based numbers", async () => {
    const created = await createTermPackForService(prismaMock, {
      year: 2026,
      term: 4,
      termStart: new Date("2026-10-13T00:00:00.000Z"),
      service,
      requestedById: "mkt-1",
    });

    expect(created).toBe(4);
    const args = createArgs();
    expect(args).toHaveLength(4);
    // Sequential generation: count-based numbers only stay distinct when the
    // creates run one at a time (Promise.all would mint duplicates).
    expect(args.map((a) => a.requestNumber)).toEqual([
      "REQ-2026-0001",
      "REQ-2026-0002",
      "REQ-2026-0003",
      "REQ-2026-0004",
    ]);
    expect(args.map((a) => a.type)).toEqual([
      "poster",
      "flyer",
      "social_tile",
      "email_header",
    ]);
    for (const a of args) {
      expect(a.serviceId).toBe("svc-1");
      expect(a.requestedById).toBe("mkt-1");
      // Purpose ENDS with the idempotency marker.
      expect(a.purpose).toMatch(/\n\[auto:term-pack:2026-T4\]$/);
      // Checklist seeded from the type default.
      expect(a.checklist).toEqual(
        DEFAULT_CHECKLISTS[a.type as keyof typeof DEFAULT_CHECKLISTS].map(
          (label) => ({ label, done: false }),
        ),
      );
    }
    expect(args[0].title).toBe("Term 4 welcome poster — Test Centre");
  });

  it("far-term: dueDate is termStart - 7d for every type", async () => {
    await createTermPackForService(prismaMock, {
      year: 2026,
      term: 4,
      termStart: new Date("2026-10-13T00:00:00.000Z"),
      service,
      requestedById: "mkt-1",
    });

    for (const a of createArgs()) {
      expect((a.dueDate as Date).toISOString()).toBe("2026-10-06T00:00:00.000Z");
    }
  });

  it("near-term: dueDate clamps up to today + the type's turnaround", async () => {
    // Term starts 9 days out → target (termStart - 7d) = Fri 3 Jul.
    await createTermPackForService(prismaMock, {
      year: 2026,
      term: 3,
      termStart: new Date("2026-07-10T00:00:00.000Z"),
      service,
      requestedById: "mkt-1",
    });

    const byType = Object.fromEntries(
      createArgs().map((a) => [a.type, (a.dueDate as Date).toISOString()]),
    );
    // poster: 5 business days from Wed 1 Jul → Wed 8 Jul (floor wins).
    expect(byType.poster).toBe("2026-07-08T00:00:00.000Z");
    // flyer: 3 business days → Mon 6 Jul (floor wins).
    expect(byType.flyer).toBe("2026-07-06T00:00:00.000Z");
    // social_tile/email_header: 2 business days → Fri 3 Jul = target (no clamp).
    expect(byType.social_tile).toBe("2026-07-03T00:00:00.000Z");
    expect(byType.email_header).toBe("2026-07-03T00:00:00.000Z");
  });
});

describe("notifyTermPackCreated", () => {
  it("creates ONE digest notification per active marketing user", async () => {
    await notifyTermPackCreated(prismaMock, { count: 12, term: 3, year: 2026 });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { role: "marketing", active: true },
      select: { id: true },
    });
    expect(prismaMock.userNotification.createMany).toHaveBeenCalledTimes(1);
    const { data } = prismaMock.userNotification.createMany.mock.calls[0][0];
    expect(data).toHaveLength(2);
    expect(data.map((d: { userId: string }) => d.userId)).toEqual(["mkt-1", "mkt-2"]);
    for (const row of data) {
      expect(row.type).toBe("term_pack_created");
      expect(row.link).toBe("/requests");
      expect(row.title).toContain("Term 3");
      expect(row.body).toContain("12");
    }
  });

  it("swallows errors (logs, never throws)", async () => {
    prismaMock.user.findMany.mockRejectedValue(new Error("db down"));

    await expect(
      notifyTermPackCreated(prismaMock, { count: 4, term: 3, year: 2026 }),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it("no-ops when there are no active marketing users", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);

    await notifyTermPackCreated(prismaMock, { count: 4, term: 3, year: 2026 });
    expect(prismaMock.userNotification.createMany).not.toHaveBeenCalled();
  });
});

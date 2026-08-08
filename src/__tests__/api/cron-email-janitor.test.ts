import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

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

const guardComplete = vi.fn(async () => {});
const guardFail = vi.fn(async () => {});
vi.mock("@/lib/cron-guard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cron-guard")>("@/lib/cron-guard");
  return {
    ...actual,
    acquireCronLock: vi.fn(async () => ({
      acquired: true,
      complete: guardComplete,
      fail: guardFail,
    })),
  };
});

vi.mock("@/lib/brevo", () => ({
  listBrevoLists: vi.fn(),
  deleteBrevoList: vi.fn(),
}));

import { GET } from "@/app/api/cron/email-janitor/route";
import { acquireCronLock } from "@/lib/cron-guard";
import { listBrevoLists, deleteBrevoList } from "@/lib/brevo";

const mockedListBrevoLists = vi.mocked(listBrevoLists);
const mockedDeleteBrevoList = vi.mocked(deleteBrevoList);

const NOW = new Date("2026-08-08T19:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function authed() {
  return createRequest("GET", "/api/cron/email-janitor", {
    headers: { authorization: "Bearer test-secret" },
  });
}

/** Route deliveryLog.findMany by where-shape: candidates vs scheduled rows. */
function mockDeliveryRows({
  candidates = [] as Array<Record<string, unknown>>,
  scheduled = [] as Array<Record<string, unknown>>,
} = {}) {
  prismaMock.deliveryLog.findMany.mockImplementation(
    async (args: { where?: { status?: unknown } } | undefined) => {
      if (args?.where?.status === "scheduled") return scheduled as never;
      return candidates as never;
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  vi.setSystemTime(NOW);

  prismaMock.deliveryLog.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.deliveryLog.update.mockResolvedValue({});
  prismaMock.marketingSendRecipient.deleteMany.mockResolvedValue({ count: 0 });
  mockDeliveryRows();
  mockedListBrevoLists.mockResolvedValue({ lists: [], count: 0 });
  mockedDeleteBrevoList.mockResolvedValue(undefined);
});

afterAll(() => {
  vi.useRealTimers();
});

describe("GET /api/cron/email-janitor", () => {
  it("401 when CRON_SECRET wrong", async () => {
    const res = await GET(
      createRequest("GET", "/api/cron/email-janitor", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
    expect(prismaMock.deliveryLog.updateMany).not.toHaveBeenCalled();
  });

  it("idempotent — skipped when guard not acquired", async () => {
    vi.mocked(acquireCronLock).mockResolvedValueOnce({
      acquired: false,
      reason: "already complete",
      complete: async () => {},
      fail: async () => {},
    });
    const res = await GET(authed());
    const data = await res.json();
    expect(data.skipped).toBe(true);
    expect(prismaMock.deliveryLog.updateMany).not.toHaveBeenCalled();
    expect(mockedListBrevoLists).not.toHaveBeenCalled();
  });

  it("sweeps stranded 'sending' rows older than 1h to failed with the janitor errorMessage", async () => {
    prismaMock.deliveryLog.updateMany.mockResolvedValue({ count: 3 });
    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.stranded).toBe(3);

    expect(prismaMock.deliveryLog.updateMany).toHaveBeenCalledTimes(1);
    const arg = prismaMock.deliveryLog.updateMany.mock.calls[0][0];
    expect(arg.where.status).toBe("sending");
    expect(arg.where.createdAt.lt).toEqual(new Date(NOW.getTime() - HOUR_MS));
    expect(arg.data.status).toBe("failed");
    expect(arg.data.errorMessage).toBe(
      "Stranded in 'sending' — dispatch did not complete (janitor)",
    );
    expect(guardComplete).toHaveBeenCalledWith(
      expect.objectContaining({ stranded: 3 }),
    );
  });

  it("deletes tracked lists for old non-scheduled sends and marks payloads _brevoListCleaned", async () => {
    mockDeliveryRows({
      candidates: [
        { id: "dl-1", payload: { subject: "A", _brevoListId: 111 } },
        // Already cleaned — must not be deleted again.
        { id: "dl-2", payload: { _brevoListId: 222, _brevoListCleaned: true } },
        // No list id (legacy / <50 path row) — skipped.
        { id: "dl-3", payload: { subject: "C" } },
      ],
    });

    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.trackedCleaned).toBe(1);

    // Candidate query stays on indexed columns — payload filtering is in JS.
    const findArg = prismaMock.deliveryLog.findMany.mock.calls[0][0];
    expect(findArg.where.channel).toBe("email");
    expect(findArg.where.externalIdType).toBe("brevo_campaign");
    expect(findArg.where.status).toEqual({ notIn: ["scheduled"] });
    expect(findArg.where.createdAt.lt).toEqual(
      new Date(NOW.getTime() - 2 * DAY_MS),
    );

    expect(mockedDeleteBrevoList).toHaveBeenCalledTimes(1);
    expect(mockedDeleteBrevoList).toHaveBeenCalledWith(111);

    expect(prismaMock.deliveryLog.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.deliveryLog.update.mock.calls[0][0];
    expect(updateArg.where.id).toBe("dl-1");
    expect(updateArg.data.payload).toEqual({
      subject: "A",
      _brevoListId: 111,
      _brevoListCleaned: true,
    });
  });

  it("does not mark a row cleaned when the Brevo delete fails (retried next run)", async () => {
    mockDeliveryRows({
      candidates: [{ id: "dl-1", payload: { _brevoListId: 111 } }],
    });
    mockedDeleteBrevoList.mockRejectedValueOnce(new Error("Brevo down"));

    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.trackedCleaned).toBe(0);
    expect(prismaMock.deliveryLog.update).not.toHaveBeenCalled();
  });

  it("caps the tracked sweep at 20 deletions per run", async () => {
    mockDeliveryRows({
      candidates: Array.from({ length: 25 }, (_, i) => ({
        id: `dl-${i}`,
        payload: { _brevoListId: 1000 + i },
      })),
    });

    const res = await GET(authed());
    const data = await res.json();
    expect(data.trackedCleaned).toBe(20);
    expect(mockedDeleteBrevoList).toHaveBeenCalledTimes(20);
    expect(prismaMock.deliveryLog.update).toHaveBeenCalledTimes(20);
  });

  it("legacy sweep deletes only old delivery-<epoch> lists and protects scheduled sends' lists", async () => {
    const oldEpoch = NOW.getTime() - 10 * DAY_MS;
    const recentEpoch = NOW.getTime() - 2 * DAY_MS;
    mockDeliveryRows({
      scheduled: [{ id: "dl-s", payload: { _brevoListId: 333 } }],
    });
    mockedListBrevoLists.mockResolvedValue({
      lists: [
        { id: 300, name: `delivery-${oldEpoch}` }, // old orphan → delete
        { id: 333, name: `delivery-${oldEpoch}` }, // scheduled-protected → skip
        { id: 301, name: `delivery-${recentEpoch}` }, // < 7 days old → skip
        { id: 302, name: "Newsletter subscribers" }, // not ours → skip
      ],
      count: 4,
    });

    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.legacyDeleted).toBe(1);
    expect(mockedDeleteBrevoList).toHaveBeenCalledTimes(1);
    expect(mockedDeleteBrevoList).toHaveBeenCalledWith(300);
  });

  it("legacy sweep paginates until a short page", async () => {
    const oldEpoch = NOW.getTime() - 10 * DAY_MS;
    // Page 1: 50 non-matching lists (full page → keep going); page 2: one old orphan.
    mockedListBrevoLists.mockImplementation(async (offset: number) => {
      if (offset === 0) {
        return {
          lists: Array.from({ length: 50 }, (_, i) => ({
            id: i + 1,
            name: `Audience ${i}`,
          })),
          count: 51,
        };
      }
      return { lists: [{ id: 900, name: `delivery-${oldEpoch}` }], count: 51 };
    });

    const res = await GET(authed());
    const data = await res.json();
    expect(data.legacyDeleted).toBe(1);
    expect(mockedListBrevoLists).toHaveBeenCalledTimes(2);
    expect(mockedListBrevoLists).toHaveBeenNthCalledWith(1, 0, 50);
    expect(mockedListBrevoLists).toHaveBeenNthCalledWith(2, 50, 50);
    expect(mockedDeleteBrevoList).toHaveBeenCalledWith(900);
  });

  it("caps the legacy sweep at 20 deletions per run", async () => {
    const oldEpoch = NOW.getTime() - 10 * DAY_MS;
    mockedListBrevoLists.mockResolvedValue({
      lists: Array.from({ length: 25 }, (_, i) => ({
        id: 500 + i,
        name: `delivery-${oldEpoch + i}`,
      })),
      count: 25,
    });

    const res = await GET(authed());
    const data = await res.json();
    expect(data.legacyDeleted).toBe(20);
    expect(mockedDeleteBrevoList).toHaveBeenCalledTimes(20);
  });

  it("prunes ledger rows older than 30 days and reports the count in guard.complete", async () => {
    prismaMock.marketingSendRecipient.deleteMany.mockResolvedValue({ count: 7 });

    const res = await GET(authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ledgerPruned).toBe(7);

    expect(prismaMock.marketingSendRecipient.deleteMany).toHaveBeenCalledTimes(1);
    const arg = prismaMock.marketingSendRecipient.deleteMany.mock.calls[0][0];
    expect(arg).toEqual({
      where: { sentAt: { lt: new Date(NOW.getTime() - 30 * DAY_MS) } },
    });

    expect(guardComplete).toHaveBeenCalledWith(
      expect.objectContaining({ ledgerPruned: 7 }),
    );
  });

  it("does not touch the ledger when the guard is not acquired", async () => {
    vi.mocked(acquireCronLock).mockResolvedValueOnce({
      acquired: false,
      reason: "already complete",
      complete: async () => {},
      fail: async () => {},
    });
    await GET(authed());
    expect(prismaMock.marketingSendRecipient.deleteMany).not.toHaveBeenCalled();
  });

  it("guard.fail on unexpected error", async () => {
    prismaMock.deliveryLog.updateMany.mockRejectedValue(new Error("db down"));
    const res = await GET(authed());
    expect(res.status).toBe(500);
    expect(guardFail).toHaveBeenCalledTimes(1);
    expect(guardComplete).not.toHaveBeenCalled();
  });
});

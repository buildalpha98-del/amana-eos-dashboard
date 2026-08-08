import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

// ── Standard mock preamble ──────────────────────────────────────
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
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

import { GET } from "@/app/api/email/reports/[deliveryLogId]/route";

const ctx = (deliveryLogId: string) =>
  ({ params: Promise.resolve({ deliveryLogId }) }) as never;

function setupActiveUserMock(role = "owner") {
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.findUnique.mockImplementation(
    async (args: { where?: { id?: string } } | undefined) => {
      if (args?.where?.id === "user-1") {
        return { active: true, id: "user-1", role } as never;
      }
      return null;
    },
  );
}

const SEND_AT = new Date("2026-08-01T09:00:00.000Z");

function logRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "dl-1",
    subject: "Term 3 newsletter",
    status: "sent",
    recipientCount: 4,
    createdAt: SEND_AT,
    messageType: "campaign",
    payload: null,
    renderedHtml: null,
    ...overrides,
  };
}

/** Event at `hours` after the send. */
function ev(
  type: string,
  email: string,
  hours: number,
  payload: Record<string, unknown> | null = null,
) {
  return {
    type,
    email,
    createdAt: new Date(SEND_AT.getTime() + hours * 3600000),
    payload,
  };
}

function getReport(id = "dl-1") {
  return GET(createRequest("GET", `/api/email/reports/${id}`), ctx(id));
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  setupActiveUserMock();
  mockSession({ id: "user-1", name: "Owner", role: "owner" });
  prismaMock.deliveryLog.findUnique.mockResolvedValue(logRow());
  prismaMock.emailEvent.findMany.mockResolvedValue([]);
});

describe("GET /api/email/reports/[deliveryLogId] — auth", () => {
  it.each(["owner", "head_office", "admin", "marketing"] as const)(
    "allows role %s",
    async (role) => {
      setupActiveUserMock(role);
      mockSession({ id: "user-1", name: "U", role });

      const res = await getReport();
      expect(res.status).toBe(200);
    },
  );

  it("rejects member role with 403 without touching the DB", async () => {
    setupActiveUserMock("member");
    mockSession({ id: "user-1", name: "Member", role: "member" });

    const res = await getReport();
    expect(res.status).toBe(403);
    expect(prismaMock.deliveryLog.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.emailEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown delivery log id", async () => {
    prismaMock.deliveryLog.findUnique.mockResolvedValue(null);

    const res = await getReport("nope");
    expect(res.status).toBe(404);
    expect(prismaMock.emailEvent.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/email/reports/[deliveryLogId] — aggregation", () => {
  it("fetches events with a SINGLE findMany scoped to the log and aggregates in JS", async () => {
    prismaMock.emailEvent.findMany.mockResolvedValue([
      ev("delivered", "a@x.com", 0.1),
      ev("delivered", "b@x.com", 0.1),
      ev("delivered", "c@x.com", 0.1),
      ev("opened", "a@x.com", 0.5),
      ev("opened", "b@x.com", 2.5),
      ev("clicked", "a@x.com", 1.2, { link: "https://amanaoshc.company/book" }),
      ev("bounced", "d@x.com", 0.2),
    ]);

    const res = await getReport();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(prismaMock.emailEvent.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.emailEvent.findMany).toHaveBeenCalledWith({
      where: { deliveryLogId: "dl-1" },
      select: { type: true, email: true, createdAt: true, payload: true },
    });

    expect(body.log).toMatchObject({
      id: "dl-1",
      subject: "Term 3 newsletter",
      status: "sent",
      recipientCount: 4,
      messageType: "campaign",
    });
    expect(body.hasEvents).toBe(true);
    expect(body.stats).toEqual({
      delivered: 3,
      uniqueOpens: 2,
      uniqueClicks: 1,
      bounced: 1,
      openRate: 50,
      clickRate: 25,
    });
  });

  it("dedupes stats by recipient email — repeat events don't inflate uniques", async () => {
    prismaMock.emailEvent.findMany.mockResolvedValue([
      ev("opened", "a@x.com", 0.5),
      ev("opened", "a@x.com", 3),
      ev("clicked", "a@x.com", 1, { link: "https://l.example/one" }),
      ev("clicked", "a@x.com", 2, { link: "https://l.example/one" }),
    ]);

    const res = await getReport();
    const body = await res.json();

    expect(body.stats.uniqueOpens).toBe(1);
    expect(body.stats.uniqueClicks).toBe(1);
  });

  it("returns rates of 0 when recipientCount is 0 (no divide-by-zero)", async () => {
    prismaMock.deliveryLog.findUnique.mockResolvedValue(
      logRow({ recipientCount: 0 }),
    );
    prismaMock.emailEvent.findMany.mockResolvedValue([
      ev("opened", "a@x.com", 1),
      ev("clicked", "a@x.com", 1, { link: "https://l.example" }),
    ]);

    const res = await getReport();
    const body = await res.json();

    expect(body.stats.openRate).toBe(0);
    expect(body.stats.clickRate).toBe(0);
  });

  it("flags hasEvents false when the log has zero events", async () => {
    prismaMock.emailEvent.findMany.mockResolvedValue([]);

    const res = await getReport();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.hasEvents).toBe(false);
    expect(body.stats).toEqual({
      delivered: 0,
      uniqueOpens: 0,
      uniqueClicks: 0,
      bounced: 0,
      openRate: 0,
      clickRate: 0,
    });
    expect(body.hourly).toHaveLength(24);
    expect(body.topLinks).toEqual([]);
  });
});

describe("GET /api/email/reports/[deliveryLogId] — hourly buckets", () => {
  it("buckets opens/clicks by whole hours since the send, 24 buckets always", async () => {
    prismaMock.emailEvent.findMany.mockResolvedValue([
      ev("opened", "a@x.com", 0.5), // bucket 0
      ev("opened", "b@x.com", 2.4), // bucket 2
      ev("clicked", "a@x.com", 1.9, { link: "https://l.example" }), // bucket 1
      ev("opened", "c@x.com", 23.9), // bucket 23
      ev("delivered", "a@x.com", 0.1), // delivered never appears in hourly
    ]);

    const res = await getReport();
    const body = await res.json();

    expect(body.hourly).toHaveLength(24);
    expect(body.hourly[0]).toEqual({ hour: 0, opens: 1, clicks: 0 });
    expect(body.hourly[1]).toEqual({ hour: 1, opens: 0, clicks: 1 });
    expect(body.hourly[2]).toEqual({ hour: 2, opens: 1, clicks: 0 });
    expect(body.hourly[23]).toEqual({ hour: 23, opens: 1, clicks: 0 });

    const totalOpens = body.hourly.reduce(
      (s: number, h: { opens: number }) => s + h.opens,
      0,
    );
    const totalClicks = body.hourly.reduce(
      (s: number, h: { clicks: number }) => s + h.clicks,
      0,
    );
    expect(totalOpens).toBe(3);
    expect(totalClicks).toBe(1);
  });

  it("EXCLUDES events past 24h from hourly but still counts them in totals", async () => {
    prismaMock.emailEvent.findMany.mockResolvedValue([
      ev("opened", "a@x.com", 0.5), // in the window
      ev("opened", "b@x.com", 30), // past 24h — totals only
      ev("clicked", "c@x.com", 48, { link: "https://l.example" }), // past 24h
    ]);

    const res = await getReport();
    const body = await res.json();

    // Totals include the late events…
    expect(body.stats.uniqueOpens).toBe(2);
    expect(body.stats.uniqueClicks).toBe(1);

    // …but hourly does NOT fold them into bucket 23 (or anywhere).
    const totalOpens = body.hourly.reduce(
      (s: number, h: { opens: number }) => s + h.opens,
      0,
    );
    const totalClicks = body.hourly.reduce(
      (s: number, h: { clicks: number }) => s + h.clicks,
      0,
    );
    expect(totalOpens).toBe(1);
    expect(totalClicks).toBe(0);
    expect(body.hourly[23]).toEqual({ hour: 23, opens: 0, clicks: 0 });
  });
});

describe("GET /api/email/reports/[deliveryLogId] — affordance flags", () => {
  it("flags canCancel for a scheduled send (and not canResend)", async () => {
    prismaMock.deliveryLog.findUnique.mockResolvedValue(
      logRow({ status: "scheduled" }),
    );

    const res = await getReport();
    const body = await res.json();

    expect(body.canCancel).toBe(true);
    expect(body.canResend).toBe(false);
    expect(body.failedCount).toBe(0);
  });

  it("flags canResend for a partial send with failed recipients AND stored HTML", async () => {
    prismaMock.deliveryLog.findUnique.mockResolvedValue(
      logRow({
        status: "partial",
        payload: { _failedRecipients: ["a@x.com", "b@x.com"] },
        renderedHtml: "<p>stored</p>",
      }),
    );

    const res = await getReport();
    const body = await res.json();

    expect(body.canResend).toBe(true);
    expect(body.canCancel).toBe(false);
    expect(body.failedCount).toBe(2);
  });

  it("does NOT flag canResend when the partial row has no stored renderedHtml", async () => {
    prismaMock.deliveryLog.findUnique.mockResolvedValue(
      logRow({
        status: "partial",
        payload: { _failedRecipients: ["a@x.com"] },
        renderedHtml: null,
      }),
    );

    const res = await getReport();
    const body = await res.json();

    expect(body.canResend).toBe(false);
    expect(body.failedCount).toBe(1);
  });

  it("does NOT flag canResend when _failedRecipients is missing or empty", async () => {
    prismaMock.deliveryLog.findUnique.mockResolvedValue(
      logRow({ status: "partial", payload: {}, renderedHtml: "<p>x</p>" }),
    );

    const res = await getReport();
    const body = await res.json();

    expect(body.canResend).toBe(false);
    expect(body.failedCount).toBe(0);
  });

  it("both flags false on a plain sent row", async () => {
    const res = await getReport();
    const body = await res.json();

    expect(body.canCancel).toBe(false);
    expect(body.canResend).toBe(false);
    expect(body.failedCount).toBe(0);
  });

  it("NEVER exposes the raw payload or renderedHtml — derived flags and counts only", async () => {
    prismaMock.deliveryLog.findUnique.mockResolvedValue(
      logRow({
        status: "partial",
        // The payload holds the full original request body (audience rules,
        // html, variables) — leaking it would hand centre staff PII + content.
        payload: {
          _failedRecipients: ["a@x.com"],
          htmlContent: "<p>secret original body</p>",
        },
        renderedHtml: "<p>rendered secret</p>",
      }),
    );

    const res = await getReport();
    const body = await res.json();

    expect(body.payload).toBeUndefined();
    expect(body.renderedHtml).toBeUndefined();
    expect(body.log.payload).toBeUndefined();
    expect(body.log.renderedHtml).toBeUndefined();
    expect(body.failedRecipients).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});

describe("GET /api/email/reports/[deliveryLogId] — topLinks", () => {
  it("groups clicked events by top-level payload.link, sorted desc, top 10", async () => {
    const events = [
      // 3 clickers on /book
      ev("clicked", "a@x.com", 1, { link: "https://l.example/book" }),
      ev("clicked", "b@x.com", 1, { link: "https://l.example/book" }),
      ev("clicked", "c@x.com", 2, { link: "https://l.example/book" }),
      // 2 clickers on /enrol
      ev("clicked", "d@x.com", 1, { link: "https://l.example/enrol" }),
      ev("clicked", "e@x.com", 1, { link: "https://l.example/enrol" }),
      // clicked event WITHOUT a top-level link — ignored for topLinks
      ev("clicked", "f@x.com", 1, { other: "field" }),
      // null payload — ignored
      ev("clicked", "g@x.com", 1, null),
      // nested link is NOT top-level — ignored
      ev("clicked", "h@x.com", 1, { nested: { link: "https://l.example/nested" } }),
      // 10 more single-clicker links to push past the top-10 cap
      ...Array.from({ length: 10 }, (_, i) =>
        ev("clicked", `solo${i}@x.com`, 1, { link: `https://l.example/solo-${i}` }),
      ),
    ];
    prismaMock.emailEvent.findMany.mockResolvedValue(events);

    const res = await getReport();
    const body = await res.json();

    expect(body.topLinks).toHaveLength(10);
    expect(body.topLinks[0]).toEqual({
      link: "https://l.example/book",
      clickers: 3,
    });
    expect(body.topLinks[1]).toEqual({
      link: "https://l.example/enrol",
      clickers: 2,
    });
    const links = body.topLinks.map((l: { link: string }) => l.link);
    expect(links).not.toContain("https://l.example/nested");
  });

  it("counts each clicker once per link (webhook dedupe means one clicked event = one recipient's first click)", async () => {
    prismaMock.emailEvent.findMany.mockResolvedValue([
      ev("clicked", "a@x.com", 1, { link: "https://l.example/book" }),
      // Same recipient, same link, duplicate event — still one clicker
      ev("clicked", "a@x.com", 2, { link: "https://l.example/book" }),
    ]);

    const res = await getReport();
    const body = await res.json();

    expect(body.topLinks).toEqual([
      { link: "https://l.example/book", clickers: 1 },
    ]);
  });
});

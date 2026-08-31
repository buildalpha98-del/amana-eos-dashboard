import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  audienceRulesSchema,
  compileAudienceWhere,
  resolveAudienceWhere,
} from "@/lib/audience-rules";

// ── audienceRulesSchema ──────────────────────────────────────

describe("audienceRulesSchema", () => {
  it("accepts an empty object (no conditions)", () => {
    const result = audienceRulesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts serviceIds alone", () => {
    const result = audienceRulesSchema.safeParse({
      serviceIds: ["svc_1", "svc_2"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts statuses alone", () => {
    const result = audienceRulesSchema.safeParse({
      statuses: ["active", "paused"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts joinedAfter alone", () => {
    const result = audienceRulesSchema.safeParse({
      joinedAfter: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts joinedBefore alone", () => {
    const result = audienceRulesSchema.safeParse({
      joinedBefore: "2026-06-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts engagement alone", () => {
    const result = audienceRulesSchema.safeParse({
      engagement: { kind: "opened", days: 30 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts all conditions combined", () => {
    const result = audienceRulesSchema.safeParse({
      serviceIds: ["svc_1"],
      statuses: ["active"],
      joinedAfter: "2026-01-01T00:00:00.000Z",
      joinedBefore: "2026-06-01T00:00:00.000Z",
      engagement: { kind: "not_opened", days: 90 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown top-level field (strict)", () => {
    const result = audienceRulesSchema.safeParse({
      serviceIds: ["svc_1"],
      somethingElse: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a rules object smuggling a raw where-clause field like `email`", () => {
    // The compiler must never interpolate rule keys straight into the
    // Prisma where — the schema whitelist is what prevents that, so a
    // caller can't smuggle an arbitrary where-clause key through rules.
    const result = audienceRulesSchema.safeParse({
      email: { in: ["someone@example.com"] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty-string serviceIds", () => {
    const result = audienceRulesSchema.safeParse({
      serviceIds: [""],
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown statuses outside the whitelist", () => {
    const result = audienceRulesSchema.safeParse({
      statuses: ["banned"],
    });
    expect(result.success).toBe(false);
  });

  it.each(["active", "withdrawn", "paused"])(
    "accepts whitelisted status %s",
    (status) => {
      const result = audienceRulesSchema.safeParse({ statuses: [status] });
      expect(result.success).toBe(true);
    },
  );

  it("rejects engagement.days below 1", () => {
    const result = audienceRulesSchema.safeParse({
      engagement: { kind: "opened", days: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects engagement.days above 365", () => {
    const result = audienceRulesSchema.safeParse({
      engagement: { kind: "opened", days: 366 },
    });
    expect(result.success).toBe(false);
  });

  it("accepts engagement.days at the boundaries (1 and 365)", () => {
    expect(
      audienceRulesSchema.safeParse({ engagement: { kind: "opened", days: 1 } })
        .success,
    ).toBe(true);
    expect(
      audienceRulesSchema.safeParse({
        engagement: { kind: "opened", days: 365 },
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown engagement.kind", () => {
    const result = audienceRulesSchema.safeParse({
      engagement: { kind: "subscribed", days: 30 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields inside engagement (nested strict)", () => {
    const result = audienceRulesSchema.safeParse({
      engagement: { kind: "opened", days: 30, extra: "nope" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unparseable joinedAfter string", () => {
    const result = audienceRulesSchema.safeParse({
      joinedAfter: "garbage-not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a date-only joinedAfter string (from <input type=\"date\">)", () => {
    const result = audienceRulesSchema.safeParse({
      joinedAfter: "2026-08-07",
    });
    expect(result.success).toBe(true);
  });
});

// ── compileAudienceWhere (pure) ──────────────────────────────

describe("compileAudienceWhere", () => {
  it("returns the ALWAYS-subscribed base for empty rules", () => {
    expect(compileAudienceWhere({})).toEqual({ subscribed: true });
  });

  it("compiles serviceIds to serviceId: { in }", () => {
    expect(compileAudienceWhere({ serviceIds: ["svc_1", "svc_2"] })).toEqual({
      subscribed: true,
      serviceId: { in: ["svc_1", "svc_2"] },
    });
  });

  it("compiles statuses to status: { in }", () => {
    expect(compileAudienceWhere({ statuses: ["active", "paused"] })).toEqual({
      subscribed: true,
      status: { in: ["active", "paused"] },
    });
  });

  it("compiles joinedAfter to createdAt: { gte }", () => {
    const where = compileAudienceWhere({
      joinedAfter: "2026-01-01T00:00:00.000Z",
    });
    expect(where).toEqual({
      subscribed: true,
      createdAt: { gte: new Date("2026-01-01T00:00:00.000Z") },
    });
  });

  it("compiles a date-only joinedAfter (<input type=\"date\">) into a valid Date", () => {
    const where = compileAudienceWhere({ joinedAfter: "2026-08-07" });
    const data = where as { createdAt?: { gte?: unknown } };
    expect(data.createdAt?.gte).toBeInstanceOf(Date);
    expect(
      data.createdAt?.gte instanceof Date &&
        !Number.isNaN(data.createdAt.gte.getTime()),
    ).toBe(true);
  });

  it("compiles joinedBefore to createdAt: { lte }", () => {
    const where = compileAudienceWhere({
      joinedBefore: "2026-06-01T00:00:00.000Z",
    });
    expect(where).toEqual({
      subscribed: true,
      createdAt: { lte: new Date("2026-06-01T00:00:00.000Z") },
    });
  });

  it("combines joinedAfter + joinedBefore into ONE createdAt object", () => {
    const where = compileAudienceWhere({
      joinedAfter: "2026-01-01T00:00:00.000Z",
      joinedBefore: "2026-06-01T00:00:00.000Z",
    });
    expect(where).toEqual({
      subscribed: true,
      createdAt: {
        gte: new Date("2026-01-01T00:00:00.000Z"),
        lte: new Date("2026-06-01T00:00:00.000Z"),
      },
    });
  });

  it("combines serviceIds + statuses + date range in one where", () => {
    const where = compileAudienceWhere({
      serviceIds: ["svc_1"],
      statuses: ["active"],
      joinedAfter: "2026-01-01T00:00:00.000Z",
      joinedBefore: "2026-06-01T00:00:00.000Z",
    });
    expect(where).toEqual({
      subscribed: true,
      serviceId: { in: ["svc_1"] },
      status: { in: ["active"] },
      createdAt: {
        gte: new Date("2026-01-01T00:00:00.000Z"),
        lte: new Date("2026-06-01T00:00:00.000Z"),
      },
    });
  });

  it("ignores engagement (async-only condition) — no email key set", () => {
    const where = compileAudienceWhere({
      engagement: { kind: "opened", days: 30 },
    });
    expect(where).toEqual({ subscribed: true });
    expect(where).not.toHaveProperty("email");
  });
});

// ── resolveAudienceWhere (async, engagement) ─────────────────

describe("resolveAudienceWhere", () => {
  const emailEvent = { findMany: vi.fn() };
  const prisma = { emailEvent } as unknown as Pick<
    import("@prisma/client").PrismaClient,
    "emailEvent"
  >;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("with no engagement, is identical to compileAudienceWhere and does NOT query emailEvent", async () => {
    const rules = { serviceIds: ["svc_1"], statuses: ["active" as const] };
    const where = await resolveAudienceWhere(prisma, rules);

    expect(where).toEqual(compileAudienceWhere(rules));
    expect(emailEvent.findMany).not.toHaveBeenCalled();
  });

  it("engagement.kind 'opened' queries emailEvent for opened events and ANDs email: { in } (lowercased, case-insensitive)", async () => {
    emailEvent.findMany.mockResolvedValue([
      { email: "Alice@Example.com" },
      { email: "bob@example.com" },
    ]);

    const where = await resolveAudienceWhere(prisma, {
      engagement: { kind: "opened", days: 30 },
    });

    const expectedSince = new Date("2026-07-08T12:00:00.000Z"); // now - 30d

    expect(emailEvent.findMany).toHaveBeenCalledWith({
      where: { type: "opened", createdAt: { gte: expectedSince } },
      select: { email: true },
      distinct: ["email"],
    });

    expect(where).toEqual({
      subscribed: true,
      email: { in: ["alice@example.com", "bob@example.com"], mode: "insensitive" },
    });
  });

  it("engagement.kind 'clicked' queries emailEvent for clicked events and ANDs email: { in }", async () => {
    emailEvent.findMany.mockResolvedValue([{ email: "clicker@example.com" }]);

    const where = await resolveAudienceWhere(prisma, {
      engagement: { kind: "clicked", days: 7 },
    });

    expect(emailEvent.findMany).toHaveBeenCalledWith({
      where: {
        type: "clicked",
        createdAt: { gte: new Date("2026-07-31T12:00:00.000Z") },
      },
      select: { email: true },
      distinct: ["email"],
    });
    expect(where).toEqual({
      subscribed: true,
      email: { in: ["clicker@example.com"], mode: "insensitive" },
    });
  });

  it("engagement.kind 'not_opened' ANDs email: { notIn } with the opened-events list", async () => {
    emailEvent.findMany.mockResolvedValue([
      { email: "opener@example.com" },
    ]);

    const where = await resolveAudienceWhere(prisma, {
      engagement: { kind: "not_opened", days: 60 },
    });

    expect(emailEvent.findMany).toHaveBeenCalledWith({
      where: {
        type: "opened",
        createdAt: { gte: new Date("2026-06-08T12:00:00.000Z") },
      },
      select: { email: true },
      distinct: ["email"],
    });
    expect(where).toEqual({
      subscribed: true,
      email: { notIn: ["opener@example.com"], mode: "insensitive" },
    });
  });

  it("combines engagement with other conditions (serviceIds + statuses + engagement)", async () => {
    emailEvent.findMany.mockResolvedValue([{ email: "match@example.com" }]);

    const where = await resolveAudienceWhere(prisma, {
      serviceIds: ["svc_1"],
      statuses: ["active"],
      engagement: { kind: "opened", days: 14 },
    });

    expect(where).toEqual({
      subscribed: true,
      serviceId: { in: ["svc_1"] },
      status: { in: ["active"] },
      email: { in: ["match@example.com"], mode: "insensitive" },
    });
  });

  it("returns email: { in: [] } when no one matches the engagement window (asserts a query still happened, no accidental match-all)", async () => {
    emailEvent.findMany.mockResolvedValue([]);

    const where = await resolveAudienceWhere(prisma, {
      engagement: { kind: "opened", days: 30 },
    });

    expect(emailEvent.findMany).toHaveBeenCalledTimes(1);
    expect(where).toEqual({
      subscribed: true,
      email: { in: [], mode: "insensitive" },
    });
  });
});

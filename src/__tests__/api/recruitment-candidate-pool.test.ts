/**
 * GET/POST /api/recruitment/candidates — the casual pool.
 *
 * Before 2026-09-15 candidates were only reachable through the vacancy they
 * applied to, so "who do we have available?" had no answer. These tests pin
 * the filtering contract, because getting it wrong shows the wrong people to
 * a coordinator trying to fill a shift.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

import { GET, POST } from "@/app/api/recruitment/candidates/route";

function call(qs = "") {
  return GET(createRequest("GET", `/api/recruitment/candidates${qs}`));
}

/** Flatten the AND array the route builds so assertions read clearly. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function andClauses(): any[] {
  return prismaMock.recruitmentCandidate.findMany.mock.calls[0][0].where.AND;
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.recruitmentCandidate.findMany.mockResolvedValue([]);
  prismaMock.recruitmentCandidate.count.mockResolvedValue(0);
  mockSession({ id: "hq-1", name: "State Manager", role: "head_office" });
});

describe("GET /api/recruitment/candidates", () => {
  it("requires authentication", async () => {
    mockNoSession();
    expect((await call()).status).toBe(401);
  });

  it("hides archived candidates from the working list", async () => {
    await call();
    expect(andClauses()).toContainEqual({ archivedAt: null });
  });

  it("shows only archived candidates in the archive view", async () => {
    await call("?scope=archived");
    expect(andClauses()).toContainEqual({ archivedAt: { not: null } });
  });

  it("defaults to stages still worth contacting", async () => {
    await call();
    const stageClause = andClauses().find((c) => c.stage?.in);
    expect(stageClause.stage.in).toContain("available");
    expect(stageClause.stage.in).not.toContain("hired");
    expect(stageClause.stage.in).not.toContain("not_suitable");
  });

  it("drops the active-stage default when a stage is named", async () => {
    await call("?stage=hired");
    expect(andClauses()).toContainEqual({ stage: "hired" });
    expect(andClauses().some((c) => c.stage?.in)).toBe(false);
  });

  it("filters by session and day, which is how a shift gets filled", async () => {
    await call("?session=asc&day=tue");
    expect(andClauses()).toContainEqual({ availableSessions: { has: "asc" } });
    expect(andClauses()).toContainEqual({ availableDays: { has: "tue" } });
  });

  it("searches name, email, phone and location together", async () => {
    await call("?q=officer");
    const or = andClauses().find((c) => c.OR)?.OR ?? [];
    const fields = or.map((clause: Record<string, unknown>) => Object.keys(clause)[0]);
    expect(fields).toEqual(["name", "email", "phone", "suburb", "postcode"]);
  });

  it("sorts never-contacted people first when chasing a stale pool", async () => {
    await call("?sort=stale");
    const orderBy = prismaMock.recruitmentCandidate.findMany.mock.calls[0][0].orderBy;
    expect(orderBy).toEqual([{ lastContactedAt: { sort: "asc", nulls: "first" } }]);
  });

  it("rejects an unknown session rather than silently ignoring it", async () => {
    expect((await call("?session=midnight")).status).toBe(400);
  });
});

describe("POST /api/recruitment/candidates", () => {
  it("adds a walk-in with no vacancy attached", async () => {
    prismaMock.recruitmentCandidate.create.mockResolvedValue({ id: "c-1" });
    const res = await POST(
      createRequest("POST", "/api/recruitment/candidates", {
        body: { name: "Aisha", source: "walkin", availableSessions: ["asc"] },
      }),
    );
    expect(res.status).toBe(201);
    const data = prismaMock.recruitmentCandidate.create.mock.calls[0][0].data;
    expect(data.vacancyId).toBeNull();
    expect(data.availableSessions).toEqual(["asc"]);
    expect(data.availableDays).toEqual([]);
  });

  it("requires a name", async () => {
    const res = await POST(
      createRequest("POST", "/api/recruitment/candidates", { body: { source: "walkin" } }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a source outside the known list", async () => {
    const res = await POST(
      createRequest("POST", "/api/recruitment/candidates", {
        body: { name: "Aisha", source: "carrier-pigeon" },
      }),
    );
    expect(res.status).toBe(400);
  });
});

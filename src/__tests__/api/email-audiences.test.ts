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
vi.mock("@/lib/email-suppression", () => ({
  getSuppressedEmails: vi.fn(),
}));

import { getSuppressedEmails } from "@/lib/email-suppression";

const mockedGetSuppressedEmails = vi.mocked(getSuppressedEmails);

import { GET as listAudiences, POST as createAudience } from "@/app/api/email/audiences/route";
import {
  GET as getAudience,
  PATCH as patchAudience,
  DELETE as deleteAudience,
} from "@/app/api/email/audiences/[id]/route";
import { POST as previewCount } from "@/app/api/email/audiences/preview-count/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

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

function audienceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "aud-1",
    name: "Active families",
    description: null,
    rules: { serviceIds: ["svc-1"], statuses: ["active"] },
    archived: false,
    createdById: "user-1",
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

function contact(email: string) {
  return { email };
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  setupActiveUserMock();
  mockSession({ id: "user-1", name: "Owner", role: "owner" });
  mockedGetSuppressedEmails.mockResolvedValue(new Set());
});

describe("GET /api/email/audiences — list", () => {
  it("returns non-archived audiences only", async () => {
    prismaMock.emailAudience.findMany.mockResolvedValue([audienceRow()]);

    const res = await listAudiences(createRequest("GET", "/api/email/audiences"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].id).toBe("aud-1");

    const args = prismaMock.emailAudience.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ archived: false });
  });

  it("rejects member role with 403", async () => {
    setupActiveUserMock("member");
    mockSession({ id: "user-1", name: "Member", role: "member" });

    const res = await listAudiences(createRequest("GET", "/api/email/audiences"));
    expect(res.status).toBe(403);
    expect(prismaMock.emailAudience.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/email/audiences — create", () => {
  it("creates an audience with validated rules and the session user as creator", async () => {
    prismaMock.emailAudience.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) =>
        audienceRow({ ...args.data }) as never,
    );

    const res = await createAudience(
      createRequest("POST", "/api/email/audiences", {
        body: {
          name: "Active families",
          rules: { serviceIds: ["svc-1"], statuses: ["active"] },
        },
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe("Active families");

    const createArgs = prismaMock.emailAudience.create.mock.calls[0][0];
    expect(createArgs.data.createdById).toBe("user-1");
    expect(createArgs.data.rules).toEqual({
      serviceIds: ["svc-1"],
      statuses: ["active"],
    });
  });

  it("rejects rules that fail audienceRulesSchema with 400", async () => {
    const res = await createAudience(
      createRequest("POST", "/api/email/audiences", {
        body: {
          name: "Bad",
          // `email` is not a whitelisted rule field — strict schema must reject
          rules: { email: { in: ["hax@example.com"] } },
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.emailAudience.create).not.toHaveBeenCalled();
  });

  it("rejects a missing name with 400", async () => {
    const res = await createAudience(
      createRequest("POST", "/api/email/audiences", {
        body: { rules: {} },
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.emailAudience.create).not.toHaveBeenCalled();
  });

  it("rejects member role with 403", async () => {
    setupActiveUserMock("member");
    mockSession({ id: "user-1", name: "Member", role: "member" });

    const res = await createAudience(
      createRequest("POST", "/api/email/audiences", {
        body: { name: "X", rules: {} },
      }),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.emailAudience.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/email/audiences/[id] — detail + live count", () => {
  it("returns the audience with a live post-suppression count", async () => {
    prismaMock.emailAudience.findUnique.mockResolvedValue(audienceRow());
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
      contact("c@example.com"),
    ]);
    mockedGetSuppressedEmails.mockResolvedValue(new Set(["c@example.com"]));

    const res = await getAudience(
      createRequest("GET", "/api/email/audiences/aud-1"),
      ctx("aud-1"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("aud-1");
    expect(json.count).toBe(2);

    // Count must be resolved through the shared compiler — rules → where
    const where = prismaMock.centreContact.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      subscribed: true,
      serviceId: { in: ["svc-1"] },
      status: { in: ["active"] },
    });
  });

  it("returns 404 for an unknown audience", async () => {
    prismaMock.emailAudience.findUnique.mockResolvedValue(null);

    const res = await getAudience(
      createRequest("GET", "/api/email/audiences/nope"),
      ctx("nope"),
    );
    expect(res.status).toBe(404);
  });

  it("rejects member role with 403", async () => {
    setupActiveUserMock("member");
    mockSession({ id: "user-1", name: "Member", role: "member" });

    const res = await getAudience(
      createRequest("GET", "/api/email/audiences/aud-1"),
      ctx("aud-1"),
    );
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/email/audiences/[id]", () => {
  it("updates name and rules", async () => {
    prismaMock.emailAudience.findUnique.mockResolvedValue(audienceRow());
    prismaMock.emailAudience.update.mockImplementation(
      async (args: { data: Record<string, unknown> }) =>
        audienceRow({ ...args.data }) as never,
    );

    const res = await patchAudience(
      createRequest("PATCH", "/api/email/audiences/aud-1", {
        body: { name: "Renamed", rules: { statuses: ["withdrawn"] } },
      }),
      ctx("aud-1"),
    );
    expect(res.status).toBe(200);

    const updateArgs = prismaMock.emailAudience.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: "aud-1" });
    expect(updateArgs.data.name).toBe("Renamed");
    expect(updateArgs.data.rules).toEqual({ statuses: ["withdrawn"] });
  });

  it("rejects invalid rules with 400", async () => {
    prismaMock.emailAudience.findUnique.mockResolvedValue(audienceRow());

    const res = await patchAudience(
      createRequest("PATCH", "/api/email/audiences/aud-1", {
        body: { rules: { engagement: { kind: "opened", days: 0 } } },
      }),
      ctx("aud-1"),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.emailAudience.update).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown audience", async () => {
    prismaMock.emailAudience.findUnique.mockResolvedValue(null);

    const res = await patchAudience(
      createRequest("PATCH", "/api/email/audiences/nope", {
        body: { name: "X" },
      }),
      ctx("nope"),
    );
    expect(res.status).toBe(404);
  });

  it("rejects member role with 403", async () => {
    setupActiveUserMock("member");
    mockSession({ id: "user-1", name: "Member", role: "member" });

    const res = await patchAudience(
      createRequest("PATCH", "/api/email/audiences/aud-1", {
        body: { name: "X" },
      }),
      ctx("aud-1"),
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/email/audiences/[id] — archive, never hard-delete", () => {
  it("sets archived: true instead of deleting", async () => {
    prismaMock.emailAudience.findUnique.mockResolvedValue(audienceRow());
    prismaMock.emailAudience.update.mockResolvedValue(
      audienceRow({ archived: true }),
    );

    const res = await deleteAudience(
      createRequest("DELETE", "/api/email/audiences/aud-1"),
      ctx("aud-1"),
    );
    expect(res.status).toBe(200);

    expect(prismaMock.emailAudience.delete).not.toHaveBeenCalled();
    expect(prismaMock.emailAudience.deleteMany).not.toHaveBeenCalled();
    const updateArgs = prismaMock.emailAudience.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: "aud-1" });
    expect(updateArgs.data).toMatchObject({ archived: true });
  });

  it("returns 404 for an unknown audience", async () => {
    prismaMock.emailAudience.findUnique.mockResolvedValue(null);

    const res = await deleteAudience(
      createRequest("DELETE", "/api/email/audiences/nope"),
      ctx("nope"),
    );
    expect(res.status).toBe(404);
    expect(prismaMock.emailAudience.update).not.toHaveBeenCalled();
  });

  it("rejects member role with 403", async () => {
    setupActiveUserMock("member");
    mockSession({ id: "user-1", name: "Member", role: "member" });

    const res = await deleteAudience(
      createRequest("DELETE", "/api/email/audiences/aud-1"),
      ctx("aud-1"),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.emailAudience.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/email/audiences/preview-count — draft rules", () => {
  it("returns the post-suppression count for valid draft rules", async () => {
    prismaMock.centreContact.findMany.mockResolvedValue([
      contact("a@example.com"),
      contact("b@example.com"),
      contact("c@example.com"),
    ]);
    mockedGetSuppressedEmails.mockResolvedValue(new Set(["a@example.com"]));

    const res = await previewCount(
      createRequest("POST", "/api/email/audiences/preview-count", {
        body: { rules: { statuses: ["active"] } },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ count: 2 });

    const where = prismaMock.centreContact.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ subscribed: true, status: { in: ["active"] } });
  });

  it("rejects invalid rules with 400", async () => {
    const res = await previewCount(
      createRequest("POST", "/api/email/audiences/preview-count", {
        body: { rules: { statuses: ["bogus"] } },
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.centreContact.findMany).not.toHaveBeenCalled();
  });

  it("rejects member role with 403", async () => {
    setupActiveUserMock("member");
    mockSession({ id: "user-1", name: "Member", role: "member" });

    const res = await previewCount(
      createRequest("POST", "/api/email/audiences/preview-count", {
        body: { rules: {} },
      }),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.centreContact.findMany).not.toHaveBeenCalled();
  });
});

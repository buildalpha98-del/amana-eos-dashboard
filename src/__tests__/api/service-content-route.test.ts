import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

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

// Centre scope is stubbed rather than driven through its own DB queries —
// this test is about whether the ROUTE honours the scope it is handed.
// `vi.hoisted` because vi.mock factories are lifted above the file's consts.
const { getCentreScope } = vi.hoisted(() => ({ getCentreScope: vi.fn() }));
vi.mock("@/lib/centre-scope", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/centre-scope")>();
  return { ...actual, getCentreScope };
});

import { GET } from "@/app/api/services/[id]/content/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const SVC_A = "svcA";
const SVC_B = "svcB";

const contentRow = {
  content: { staffNotes: "Gate 1234", about: "x" },
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});

describe("GET /api/services/[id]/content — staff-only field scoping", () => {
  it("hides staffNotes for staff requesting a centre outside their scope", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff", serviceId: SVC_A });
    getCentreScope.mockResolvedValue({ serviceIds: [SVC_A] });
    prismaMock.service.findUnique.mockResolvedValue(contentRow);

    const res = await GET(createRequest("GET", `/api/services/${SVC_B}/content`), {
      params: Promise.resolve({ id: SVC_B }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect("staffNotes" in json.content).toBe(false);
    expect(json.content.about).toBe("x");
  });

  it("shows staffNotes for staff requesting their own centre", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff", serviceId: SVC_A });
    getCentreScope.mockResolvedValue({ serviceIds: [SVC_A] });
    prismaMock.service.findUnique.mockResolvedValue(contentRow);

    const res = await GET(createRequest("GET", `/api/services/${SVC_A}/content`), {
      params: Promise.resolve({ id: SVC_A }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.content.staffNotes).toBe("Gate 1234");
  });

  it("shows staffNotes for an org-wide role (null scope) regardless of centre", async () => {
    mockSession({ id: "u2", name: "Owner", role: "owner" });
    getCentreScope.mockResolvedValue({ serviceIds: null });
    prismaMock.service.findUnique.mockResolvedValue(contentRow);

    const res = await GET(createRequest("GET", `/api/services/${SVC_B}/content`), {
      params: Promise.resolve({ id: SVC_B }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.content.staffNotes).toBe("Gate 1234");
  });

  it("404s for an unknown service", async () => {
    mockSession({ id: "u1", name: "Staff", role: "staff", serviceId: SVC_A });
    getCentreScope.mockResolvedValue({ serviceIds: [SVC_A] });
    prismaMock.service.findUnique.mockResolvedValue(null);

    const res = await GET(createRequest("GET", "/api/services/unknown/content"), {
      params: Promise.resolve({ id: "unknown" }),
    });
    expect(res.status).toBe(404);
  });
});

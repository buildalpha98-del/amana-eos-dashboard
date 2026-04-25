import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
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
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

import { GET as CURRENT_GET } from "@/app/api/marketing/newsletter-chase/current/route";
import { POST as MARK_SENT_POST } from "@/app/api/marketing/newsletter-chase/[serviceId]/mark-sent/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});

describe("GET /api/marketing/newsletter-chase/current", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await CURRENT_GET(createRequest("GET", "/api/marketing/newsletter-chase/current"));
    expect(res.status).toBe(401);
  });

  it("returns null draft when no chase exists", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.aiTaskDraft.findFirst.mockResolvedValue(null);
    const res = await CURRENT_GET(createRequest("GET", "/api/marketing/newsletter-chase/current"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.draft).toBeNull();
    expect(data.eligibility).toBeDefined();
  });

  it("returns latest chase draft with sent flags merged from SchoolComm", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.aiTaskDraft.findFirst.mockResolvedValue({
      id: "draft-1",
      title: "Newsletter chase: Term 3 2026 placements — 2 schools to email",
      content: "body",
      targetId: "2026-T2-W1",
      createdAt: new Date("2026-06-29T10:00:00Z"),
      metadata: {
        nextTerm: { year: 2026, number: 3 },
        currentTerm: { year: 2026, number: 2 },
        weeksUntilTermEnd: 1,
        entries: [
          { serviceId: "s1", serviceName: "Centre A", skipped: false, skipReason: null },
          { serviceId: "s2", serviceName: "Centre B", skipped: false, skipReason: null },
        ],
      },
    });
    prismaMock.schoolComm.findMany.mockResolvedValue([{ serviceId: "s1" }]);
    const res = await CURRENT_GET(createRequest("GET", "/api/marketing/newsletter-chase/current"));
    const data = await res.json();
    expect(data.draft.entries).toHaveLength(2);
    const a = data.draft.entries.find((e: any) => e.serviceId === "s1");
    const b = data.draft.entries.find((e: any) => e.serviceId === "s2");
    expect(a.alreadySent).toBe(true);
    expect(b.alreadySent).toBe(false);
  });
});

describe("POST /api/marketing/newsletter-chase/[serviceId]/mark-sent", () => {
  it("401 unauth", async () => {
    mockNoSession();
    const res = await MARK_SENT_POST(
      createRequest("POST", "/api/marketing/newsletter-chase/svc-1/mark-sent", {
        body: { subject: "S", body: "B" },
      }),
      { params: Promise.resolve({ serviceId: "svc-1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("400 on invalid body", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    const res = await MARK_SENT_POST(
      createRequest("POST", "/api/marketing/newsletter-chase/svc-1/mark-sent", {
        body: { subject: "" } as any,
      }),
      { params: Promise.resolve({ serviceId: "svc-1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("404 missing service", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findUnique.mockResolvedValue(null);
    const res = await MARK_SENT_POST(
      createRequest("POST", "/api/marketing/newsletter-chase/missing/mark-sent", {
        body: { subject: "Subj", body: "Body" },
      }),
      { params: Promise.resolve({ serviceId: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("creates a SchoolComm with status=sent and next-term values", async () => {
    mockSession({ id: "akram", name: "Akram", role: "marketing" });
    prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1", name: "Centre A" });
    prismaMock.schoolComm.create.mockResolvedValue({
      id: "sc-1",
      sentAt: new Date("2026-06-30T10:00:00Z"),
      year: 2026,
      term: 3,
    });
    const res = await MARK_SENT_POST(
      createRequest("POST", "/api/marketing/newsletter-chase/svc-1/mark-sent", {
        body: { subject: "Term 3 newsletter — Amana", body: "Hi Jane,...", contactName: "Jane", contactEmail: "j@x.com" },
      }),
      { params: Promise.resolve({ serviceId: "svc-1" }) },
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.schoolCommId).toBe("sc-1");
    expect(data.year).toBe(2026);
    expect(data.term).toBe(3);
    const arg = prismaMock.schoolComm.create.mock.calls[0][0];
    expect(arg.data.status).toBe("sent");
    expect(arg.data.type).toBe("newsletter");
    expect(arg.data.sentById).toBe("akram");
  });
});

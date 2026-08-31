/**
 * Tests for the public careers funnel.
 *
 * What MUST be true:
 *   - GET lists only open, website-published vacancies (no auth needed)
 *   - POST apply creates a Candidate with source "website" (no auth needed)
 *   - Honeypot submissions are silently dropped (201, no create)
 *   - You can't apply to an unpublished/filled/unknown vacancy (404)
 *   - Missing email fails validation (400)
 *   - Rate-limited requests get 429
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req",
}));

const checkRateLimit = vi.fn(() =>
  Promise.resolve({ limited: false, remaining: 10, resetIn: 0 }),
);
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...(a as [])) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/storage", () => ({
  uploadFile: vi.fn(() => Promise.resolve({ url: "https://blob/resume.pdf" })),
}));
vi.mock("@/lib/file-validation", () => ({ validateFileContent: vi.fn(() => true) }));

import { GET } from "@/app/api/public/careers/route";
import { POST } from "@/app/api/public/careers/[id]/apply/route";

const openVacancy = {
  id: "vac-1",
  role: "educator",
  employmentType: "casual",
  qualificationRequired: "cert_iii",
  notes: "Come work with us!",
  postedAt: new Date("2026-06-01"),
  createdAt: new Date("2026-06-01"),
  service: { name: "MFIS Greenacre", suburb: "Greenacre", state: "NSW" },
  assignedTo: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ limited: false, remaining: 10, resetIn: 0 });
  prismaMock.user.findMany.mockResolvedValue([]);
});

describe("GET /api/public/careers", () => {
  it("returns mapped open, website-published vacancies", async () => {
    prismaMock.recruitmentVacancy.findMany.mockResolvedValue([openVacancy] as never);
    const res = await GET(createRequest("GET", "/api/public/careers"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openings).toHaveLength(1);
    expect(body.openings[0]).toMatchObject({
      id: "vac-1",
      roleLabel: "Educator",
      employmentLabel: "Casual",
      qualification: "Certificate III",
      centre: "MFIS Greenacre",
      location: "Greenacre, NSW",
      description: "Come work with us!",
    });
    // Must filter on status open + website channel.
    const where = prismaMock.recruitmentVacancy.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ status: "open", postedChannels: { has: "website" } });
  });
});

describe("POST /api/public/careers/[id]/apply", () => {
  const ctx = { params: Promise.resolve({ id: "vac-1" }) };

  it("creates a candidate with source 'website'", async () => {
    prismaMock.recruitmentVacancy.findFirst.mockResolvedValue(openVacancy as never);
    prismaMock.recruitmentCandidate.create.mockResolvedValue({ id: "cand-1" } as never);

    const res = await POST(
      createRequest("POST", "/api/public/careers/vac-1/apply", {
        body: { name: "Aisha Khan", email: "aisha@example.com", phone: "0400000000" },
      }),
      ctx,
    );
    expect(res.status).toBe(201);
    const createArg = prismaMock.recruitmentCandidate.create.mock.calls[0]?.[0];
    expect(createArg?.data).toMatchObject({
      vacancyId: "vac-1",
      name: "Aisha Khan",
      email: "aisha@example.com",
      source: "website",
    });
  });

  it("silently drops honeypot submissions without creating a candidate", async () => {
    const res = await POST(
      createRequest("POST", "/api/public/careers/vac-1/apply", {
        body: { name: "Bot", email: "bot@spam.com", company: "SpamCo" },
      }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect(prismaMock.recruitmentCandidate.create).not.toHaveBeenCalled();
  });

  it("rejects a missing email (400)", async () => {
    const res = await POST(
      createRequest("POST", "/api/public/careers/vac-1/apply", {
        body: { name: "No Email" },
      }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unpublished/filled/unknown vacancy", async () => {
    prismaMock.recruitmentVacancy.findFirst.mockResolvedValue(null);
    const res = await POST(
      createRequest("POST", "/api/public/careers/vac-1/apply", {
        body: { name: "Aisha", email: "aisha@example.com" },
      }),
      ctx,
    );
    expect(res.status).toBe(404);
    expect(prismaMock.recruitmentCandidate.create).not.toHaveBeenCalled();
  });

  it("returns 429 when rate-limited", async () => {
    checkRateLimit.mockResolvedValue({ limited: true, remaining: 0, resetIn: 3600 });
    const res = await POST(
      createRequest("POST", "/api/public/careers/vac-1/apply", {
        body: { name: "Aisha", email: "aisha@example.com" },
      }),
      ctx,
    );
    expect(res.status).toBe(429);
  });
});

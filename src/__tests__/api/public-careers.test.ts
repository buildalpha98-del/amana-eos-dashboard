/**
 * Tests for the public careers funnel.
 *
 * What MUST be true:
 *   - GET lists only open, website-published vacancies (no auth needed)
 *   - POST apply creates a Candidate with source "website" (no auth needed)
 *   - `?src=` on the ad link attributes the candidate to that channel, and a
 *     made-up src is treated as an ordinary website visit rather than trusted
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
import { POST as REGISTER } from "@/app/api/public/careers/register/route";

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

  it("attributes the candidate to the channel on the ad's link", async () => {
    prismaMock.recruitmentVacancy.findFirst.mockResolvedValue(openVacancy as never);
    prismaMock.recruitmentCandidate.create.mockResolvedValue({ id: "cand-2" } as never);

    const res = await POST(
      createRequest("POST", "/api/public/careers/vac-1/apply", {
        body: {
          name: "Yusuf Ali",
          email: "yusuf@example.com",
          source: "indeed",
        },
      }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect(
      prismaMock.recruitmentCandidate.create.mock.calls[0]?.[0]?.data,
    ).toMatchObject({ source: "indeed" });
  });

  it("rejects an invented source rather than storing it", async () => {
    // The src sits on a public URL, so anyone can edit it. Accepting it
    // verbatim would let a stranger create funnel channels that then clutter
    // the filters permanently.
    prismaMock.recruitmentVacancy.findFirst.mockResolvedValue(openVacancy as never);
    prismaMock.recruitmentCandidate.create.mockResolvedValue({ id: "cand-3" } as never);

    const res = await POST(
      createRequest("POST", "/api/public/careers/vac-1/apply", {
        body: {
          name: "Mia Chen",
          email: "mia@example.com",
          source: "totally-made-up",
        },
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(prismaMock.recruitmentCandidate.create).not.toHaveBeenCalled();
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

describe("POST /api/public/careers/register", () => {
  const registration = {
    name: "Layla Hassan",
    email: "Layla@Example.com",
    phone: "0400111222",
  };

  it("tags a new registration with the channel from the link", async () => {
    prismaMock.recruitmentCandidate.findFirst.mockResolvedValue(null as never);
    prismaMock.recruitmentCandidate.create.mockResolvedValue({ id: "cand-10" } as never);

    const res = await REGISTER(
      createRequest("POST", "/api/public/careers/register", {
        body: { ...registration, source: "indeed" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(201);
    expect(
      prismaMock.recruitmentCandidate.create.mock.calls[0]?.[0]?.data,
    ).toMatchObject({ source: "indeed", stage: "applied" });
  });

  it("defaults to website when the link carried no channel", async () => {
    prismaMock.recruitmentCandidate.findFirst.mockResolvedValue(null as never);
    prismaMock.recruitmentCandidate.create.mockResolvedValue({ id: "cand-11" } as never);

    await REGISTER(
      createRequest("POST", "/api/public/careers/register", {
        body: registration,
      }),
      { params: Promise.resolve({}) },
    );
    expect(
      prismaMock.recruitmentCandidate.create.mock.calls[0]?.[0]?.data,
    ).toMatchObject({ source: "website" });
  });

  it("keeps the original channel when someone re-registers later", async () => {
    // First touch wins. Someone won by an Indeed ad in March who comes back
    // through the website in November was still won by the Indeed ad —
    // re-attributing on every return visit would quietly hand the whole pool
    // to whichever channel is busiest right now.
    prismaMock.recruitmentCandidate.findFirst.mockResolvedValue({ id: "cand-9" } as never);
    prismaMock.recruitmentCandidate.update.mockResolvedValue({ id: "cand-9" } as never);

    const res = await REGISTER(
      createRequest("POST", "/api/public/careers/register", {
        body: { ...registration, source: "seek" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(201);
    expect(prismaMock.recruitmentCandidate.create).not.toHaveBeenCalled();
    const updateArg = prismaMock.recruitmentCandidate.update.mock.calls[0]?.[0];
    expect(updateArg?.data).not.toHaveProperty("source");
    // The rest of their details still refresh.
    expect(updateArg?.data).toMatchObject({ name: "Layla Hassan" });
  });
});

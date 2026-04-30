import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 }),
  ),
}));

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

import { GET as listVacancies, POST as createVacancy } from "@/app/api/recruitment/route";
import { PATCH as patchVacancy } from "@/app/api/recruitment/[id]/route";
import { POST as createCandidate } from "@/app/api/recruitment/[id]/candidates/route";
import { PATCH as patchCandidate } from "@/app/api/recruitment/candidates/[id]/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

describe("GET /api/recruitment (list vacancies)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("401 when unauthenticated", async () => {
    mockNoSession();
    const req = createRequest("GET", "/api/recruitment");
    const res = await listVacancies(req);
    expect(res.status).toBe(401);
  });

  it("200 for admin", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    prismaMock.recruitmentVacancy.findMany.mockResolvedValue([]);
    prismaMock.recruitmentVacancy.count.mockResolvedValue(0);
    const req = createRequest("GET", "/api/recruitment");
    const res = await listVacancies(req);
    expect(res.status).toBe(200);
  });

  it("200 for coordinator (retains read access)", async () => {
    mockSession({ id: "u-c", name: "Coord", role: "member" });
    prismaMock.recruitmentVacancy.findMany.mockResolvedValue([]);
    prismaMock.recruitmentVacancy.count.mockResolvedValue(0);
    const req = createRequest("GET", "/api/recruitment");
    const res = await listVacancies(req);
    expect(res.status).toBe(200);
  });

  it("403 for marketing (no role access)", async () => {
    mockSession({ id: "u-m", name: "Mkt", role: "marketing" });
    const req = createRequest("GET", "/api/recruitment");
    const res = await listVacancies(req);
    expect(res.status).toBe(403);
  });

  it("403 for staff (no role access)", async () => {
    mockSession({ id: "u-s", name: "Staff", role: "staff" });
    const req = createRequest("GET", "/api/recruitment");
    const res = await listVacancies(req);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/recruitment (create vacancy — feature: recruitment.edit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("403 for coordinator (has recruitment.view only, not .edit)", async () => {
    mockSession({ id: "u-c", name: "Coord", role: "member" });
    const req = createRequest("POST", "/api/recruitment", {
      body: { serviceId: "s-1", role: "educator", employmentType: "permanent" },
    });
    const res = await createVacancy(req);
    expect(res.status).toBe(403);
  });

  it("403 for marketing (no recruitment features)", async () => {
    mockSession({ id: "u-m", name: "Mkt", role: "marketing" });
    const req = createRequest("POST", "/api/recruitment", {
      body: { serviceId: "s-1", role: "educator", employmentType: "permanent" },
    });
    const res = await createVacancy(req);
    expect(res.status).toBe(403);
  });

  it("201 for admin", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    prismaMock.recruitmentVacancy.create.mockResolvedValue({
      id: "v-1",
      serviceId: "s-1",
      role: "educator",
      employmentType: "permanent",
    });
    const req = createRequest("POST", "/api/recruitment", {
      body: { serviceId: "s-1", role: "educator", employmentType: "permanent" },
    });
    const res = await createVacancy(req);
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/recruitment/[id] (edit vacancy — feature: recruitment.edit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("403 for coordinator", async () => {
    mockSession({ id: "u-c", name: "Coord", role: "member" });
    const req = createRequest("PATCH", "/api/recruitment/v-1", { body: { status: "filled" } });
    const res = await patchVacancy(req, { params: Promise.resolve({ id: "v-1" }) });
    expect(res.status).toBe(403);
  });

  it("200 for admin", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    prismaMock.recruitmentVacancy.update.mockResolvedValue({
      id: "v-1",
      status: "filled",
    });
    const req = createRequest("PATCH", "/api/recruitment/v-1", { body: { status: "filled" } });
    const res = await patchVacancy(req, { params: Promise.resolve({ id: "v-1" }) });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/recruitment/[id]/candidates (feature: recruitment.candidates.manage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("403 for coordinator", async () => {
    mockSession({ id: "u-c", name: "Coord", role: "member" });
    const req = createRequest("POST", "/api/recruitment/v-1/candidates", {
      body: { name: "Candidate X", source: "indeed" },
    });
    const res = await createCandidate(req, { params: Promise.resolve({ id: "v-1" }) });
    expect(res.status).toBe(403);
  });

  it("201 for admin", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    prismaMock.recruitmentVacancy.findUnique.mockResolvedValue({ id: "v-1" });
    prismaMock.recruitmentCandidate.create.mockResolvedValue({
      id: "c-1",
      vacancyId: "v-1",
      name: "Candidate X",
    });
    const req = createRequest("POST", "/api/recruitment/v-1/candidates", {
      body: { name: "Candidate X", source: "indeed" },
    });
    const res = await createCandidate(req, { params: Promise.resolve({ id: "v-1" }) });
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/recruitment/candidates/[id] (feature: recruitment.candidates.manage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("403 for coordinator (read-only access)", async () => {
    mockSession({ id: "u-c", name: "Coord", role: "member" });
    const req = createRequest("PATCH", "/api/recruitment/candidates/c-1", { body: { stage: "offered" } });
    const res = await patchCandidate(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(403);
  });

  it("200 for admin", async () => {
    mockSession({ id: "u-1", name: "Admin", role: "admin" });
    prismaMock.recruitmentCandidate.update.mockResolvedValue({
      id: "c-1",
      stage: "offered",
    });
    const req = createRequest("PATCH", "/api/recruitment/candidates/c-1", { body: { stage: "offered" } });
    const res = await patchCandidate(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(200);
  });
});

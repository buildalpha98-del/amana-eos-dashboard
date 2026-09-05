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

vi.mock("bcryptjs", () => ({
  hash: vi.fn(() => "$2a$12$hashed"),
  default: { hash: vi.fn(() => "$2a$12$hashed"), compare: vi.fn() },
}));

vi.mock("@/lib/temp-password", () => ({
  generateTempPassword: vi.fn(() => "Temp-Password-123!"),
}));

vi.mock("@/lib/audit-log", () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock("@/lib/notification-defaults", () => ({
  getDefaultNotificationPrefs: vi.fn(() => ({})),
}));

vi.mock("@/lib/onboarding-seed", () => ({
  seedOnboardingPackage: vi.fn(),
}));

vi.mock("@/lib/staff-invite", () => ({
  sendWelcomeInvite: vi.fn(),
}));

import { POST } from "@/app/api/recruitment/candidates/[id]/convert/route";
import { sendWelcomeInvite } from "@/lib/staff-invite";
import { _clearUserActiveCache } from "@/lib/server-auth";

// Widened so Partial<typeof CANDIDATE> overrides can null the email or
// populate convertedUser/staffReferral without tsc complaints.
const CANDIDATE: {
  id: string;
  vacancyId: string;
  name: string;
  email: string | null;
  stage: string;
  vacancy: { id: string; serviceId: string | null; status: string; filledAt: Date | null };
  staffReferral: { id: string; status: string } | null;
  convertedUser: { id: string } | null;
} = {
  id: "cand-1",
  vacancyId: "vac-1",
  name: "Aisha Rahman",
  email: "Aisha@Example.com",
  stage: "accepted",
  vacancy: { id: "vac-1", serviceId: "svc-1", status: "offered", filledAt: null },
  staffReferral: null,
  convertedUser: null,
};

const CREATED_USER = {
  id: "user-new",
  name: "Aisha Rahman",
  email: "aisha@example.com",
  role: "staff",
  active: true,
  serviceId: "svc-1",
  candidateId: "cand-1",
  service: { id: "svc-1", name: "Test Centre", code: "TC" },
  createdAt: new Date(),
};

function setupHappyMocks(overrides?: { candidate?: Partial<typeof CANDIDATE> }) {
  prismaMock.recruitmentCandidate.findUnique.mockImplementation(
    async (args: { where?: { id?: string } }) =>
      args?.where?.id === "cand-1"
        ? { ...CANDIDATE, ...overrides?.candidate }
        : null,
  );
  prismaMock.user.create.mockResolvedValue(CREATED_USER);
  prismaMock.recruitmentCandidate.update.mockResolvedValue({});
  prismaMock.recruitmentVacancy.update.mockResolvedValue({});
  prismaMock.staffReferral.update.mockResolvedValue({});
  prismaMock.activityLog.create.mockResolvedValue({ id: "log-1" });
}

function convertRequest(body: Record<string, unknown> = {}) {
  return createRequest("POST", "/api/recruitment/candidates/cand-1/convert", {
    body,
  });
}

const ctx = { params: Promise.resolve({ id: "cand-1" }) };

describe("POST /api/recruitment/candidates/[id]/convert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    // withApiAuth active check by session-user id; email lookups return null
    // (no duplicate) unless a test overrides.
    prismaMock.user.findUnique.mockImplementation(
      async (args: { where?: { id?: string; email?: string } }) => {
        if (args?.where?.id) return { active: true, id: args.where.id };
        return null;
      },
    );
  });

  it("401 when unauthenticated", async () => {
    mockNoSession();
    const res = await POST(convertRequest(), ctx);
    expect(res.status).toBe(401);
  });

  it("403 for member (roles aligned with POST /api/users)", async () => {
    mockSession({ id: "u-c", name: "Coord", role: "member" });
    const res = await POST(convertRequest(), ctx);
    expect(res.status).toBe(403);
  });

  it("403 for staff", async () => {
    mockSession({ id: "u-s", name: "Staff", role: "staff" });
    const res = await POST(convertRequest(), ctx);
    expect(res.status).toBe(403);
  });

  it("403 when an admin tries to mint an owner account", async () => {
    mockSession({ id: "u-a", name: "Admin", role: "admin" });
    const res = await POST(convertRequest({ role: "owner" }), ctx);
    expect(res.status).toBe(403);
  });

  it("400 on invalid role value", async () => {
    mockSession({ id: "u-a", name: "Admin", role: "admin" });
    const res = await POST(convertRequest({ role: "superuser" }), ctx);
    expect(res.status).toBe(400);
  });

  it("404 when the candidate does not exist", async () => {
    mockSession({ id: "u-a", name: "Admin", role: "admin" });
    prismaMock.recruitmentCandidate.findUnique.mockResolvedValue(null);
    const res = await POST(convertRequest(), ctx);
    expect(res.status).toBe(404);
  });

  it("400 when the candidate has no email", async () => {
    mockSession({ id: "u-a", name: "Admin", role: "admin" });
    setupHappyMocks({ candidate: { email: null } });
    const res = await POST(convertRequest(), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no email/i);
  });

  it("409 with the existing user id when the email is already taken", async () => {
    mockSession({ id: "u-a", name: "Admin", role: "admin" });
    setupHappyMocks();
    prismaMock.user.findUnique.mockImplementation(
      async (args: { where?: { id?: string; email?: string } }) => {
        if (args?.where?.id) return { active: true, id: args.where.id };
        if (args?.where?.email === "aisha@example.com")
          return { id: "user-existing" };
        return null;
      },
    );
    const res = await POST(convertRequest(), ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.details).toEqual({ existingUserId: "user-existing" });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("409 with the existing user id when the candidate is already converted", async () => {
    mockSession({ id: "u-a", name: "Admin", role: "admin" });
    setupHappyMocks({ candidate: { convertedUser: { id: "user-prior" } } });
    const res = await POST(convertRequest(), ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.details).toEqual({ existingUserId: "user-prior" });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("201 happy path — creates the user, stamps candidate hired and vacancy filledByUserId", async () => {
    mockSession({ id: "u-a", name: "Admin", role: "admin" });
    setupHappyMocks();

    const res = await POST(convertRequest(), ctx);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.id).toBe("user-new");
    expect(body.onboardingId).toBeNull();

    // User created linked to the candidate, defaulted to the vacancy's centre.
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "aisha@example.com",
          role: "staff",
          serviceId: "svc-1",
          candidateId: "cand-1",
        }),
      }),
    );
    // Candidate stamped hired.
    expect(prismaMock.recruitmentCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cand-1" },
        data: expect.objectContaining({ stage: "hired" }),
      }),
    );
    // Vacancy stamped filled by the new user.
    expect(prismaMock.recruitmentVacancy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "vac-1" },
        data: expect.objectContaining({
          filledByUserId: "user-new",
          status: "filled",
          filledAt: expect.any(Date),
        }),
      }),
    );
    // Invite defaults on.
    expect(sendWelcomeInvite).toHaveBeenCalledWith(
      expect.objectContaining({ email: "aisha@example.com" }),
    );
  });

  it("201 with sendInvite=false skips the welcome email", async () => {
    mockSession({ id: "u-a", name: "Admin", role: "admin" });
    setupHappyMocks();
    const res = await POST(convertRequest({ sendInvite: false }), ctx);
    expect(res.status).toBe(201);
    expect(sendWelcomeInvite).not.toHaveBeenCalled();
  });

  it("201 new starter — induction fields flow through like POST /api/users", async () => {
    mockSession({ id: "u-o", name: "Owner", role: "owner" });
    setupHappyMocks();
    const start = "2026-09-14T00:00:00.000Z";
    const res = await POST(
      convertRequest({ newStarter: true, startDate: start }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inductionStatus: "new_starter",
          inductionDueDate: new Date(start),
          startDate: new Date(start),
        }),
      }),
    );
  });

  it("201 marks a pending staff referral hired", async () => {
    mockSession({ id: "u-a", name: "Admin", role: "admin" });
    setupHappyMocks({
      candidate: { staffReferral: { id: "ref-1", status: "pending" } },
    });
    const res = await POST(convertRequest(), ctx);
    expect(res.status).toBe(201);
    expect(prismaMock.staffReferral.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ref-1" },
        data: { status: "hired" },
      }),
    );
  });

  it("201 with an onboarding pack — assigns via the shared helper", async () => {
    mockSession({ id: "u-a", name: "Admin", role: "admin" });
    setupHappyMocks();
    prismaMock.staffOnboarding.findUnique.mockResolvedValue(null);
    prismaMock.onboardingPack.findUnique.mockResolvedValue({
      id: "pack-1",
      deleted: false,
      tasks: [{ id: "task-1" }, { id: "task-2" }],
    });
    prismaMock.staffOnboarding.create.mockResolvedValue({
      id: "onb-1",
      user: { id: "user-new", name: "Aisha Rahman", email: "aisha@example.com" },
      pack: { id: "pack-1", name: "Educator pack" },
      progress: [],
    });

    const res = await POST(convertRequest({ onboardingPackId: "pack-1" }), ctx);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.onboardingId).toBe("onb-1");
    expect(prismaMock.staffOnboarding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-new", packId: "pack-1" }),
      }),
    );
  });

  it("409 when the onboarding pack is already assigned (P2002 path)", async () => {
    mockSession({ id: "u-a", name: "Admin", role: "admin" });
    setupHappyMocks();
    prismaMock.staffOnboarding.findUnique.mockResolvedValue(null);
    prismaMock.onboardingPack.findUnique.mockResolvedValue({
      id: "pack-1",
      deleted: false,
      tasks: [],
    });
    prismaMock.staffOnboarding.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint"), { code: "P2002" }),
    );

    const res = await POST(convertRequest({ onboardingPackId: "pack-1" }), ctx);
    expect(res.status).toBe(409);
  });
});

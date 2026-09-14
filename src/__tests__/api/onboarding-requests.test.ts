import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

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
  checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 59, resetIn: 60000 })),
}));
vi.mock("@/lib/onboarding-seed", () => ({
  seedOnboardingPackage: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/onboarding-assign", () => ({
  assignOnboardingPack: vi.fn(() => Promise.resolve({ id: "assignment-1" })),
}));
vi.mock("@/lib/staff-invite", () => ({
  // Returns a RESULT now — the route records whether the invite actually
  // reached the new hire rather than assuming it did.
  sendWelcomeInvite: vi.fn(() => Promise.resolve({ status: "sent" })),
  inviteDelivered: (r: { status: string }) => r.status === "sent",
}));
vi.mock("@/lib/new-starter-request/owner-todo", () => ({
  createOnboardingOwnerTodo: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/org-settings", () => ({
  getOrgSettings: vi.fn(() =>
    Promise.resolve({ onboarding: { ownerUserId: null } }),
  ),
}));
vi.mock("@/lib/new-starter-request/first-shift-email", () => ({
  sendFirstShiftChecklistEmail: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/new-starter-request/check-ins", () => ({
  seedNewStarterCheckIns: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/new-starter-request/notify", () => ({
  notifyNewStarterRequestSubmitted: vi.fn(() => Promise.resolve()),
}));

import { GET, POST } from "@/app/api/onboarding-requests/route";
import { seedOnboardingPackage } from "@/lib/onboarding-seed";
import { assignOnboardingPack } from "@/lib/onboarding-assign";
import { sendWelcomeInvite } from "@/lib/staff-invite";
import { sendFirstShiftChecklistEmail } from "@/lib/new-starter-request/first-shift-email";
import { seedNewStarterCheckIns } from "@/lib/new-starter-request/check-ins";
import { notifyNewStarterRequestSubmitted } from "@/lib/new-starter-request/notify";
import { createOnboardingOwnerTodo } from "@/lib/new-starter-request/owner-todo";
import { getOrgSettings } from "@/lib/org-settings";

const baseRequest = {
  fullName: "Amina Yusuf",
  dateOfBirth: "2000-01-15",
  address: "1 Example St, Adelaide SA 5000",
  mobile: "0400 000 000",
  email: "amina@example.com",
  targetPosition: "Educator",
  employmentType: "casual",
  serviceId: "svc-1",
  expectedStartDate: "2026-10-01",
};

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.activityLog.create.mockResolvedValue({});
  prismaMock.userNotification.createMany.mockResolvedValue({ count: 0 });
  prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1" });
  prismaMock.onboardingPack.findFirst.mockResolvedValue(null);
  prismaMock.user.create.mockResolvedValue({
    id: "new-user-1",
    name: "Amina Yusuf",
    email: "amina@example.com",
    serviceId: "svc-1",
  });
  prismaMock.newStarterRequest.create.mockResolvedValue({
    id: "r-new",
    fullName: "Amina Yusuf",
    email: "amina@example.com",
    requestedById: "hq1",
    serviceId: "svc-1",
  });
  // The route stamps the invite outcome onto the row after sending, and
  // returns THAT, so the client sees the real delivery status.
  prismaMock.newStarterRequest.update.mockResolvedValue({
    id: "r-new",
    fullName: "Amina Yusuf",
    email: "amina@example.com",
    requestedById: "hq1",
    serviceId: "svc-1",
    inviteStatus: "sent",
    inviteError: null,
  });

  // withApiAuth's own session-user lookup and the route's own
  // find-existing-account-by-email check share prismaMock.user.findUnique;
  // route by call args so each gets the right answer.
  prismaMock.user.findUnique.mockImplementation((args: unknown) => {
    const a = args as { where?: { id?: string; email?: string } };
    if (a?.where?.id) return Promise.resolve({ id: a.where.id, active: true });
    if (a?.where?.email) return Promise.resolve(null); // no existing account by default
    return Promise.resolve(null);
  });
});

describe("GET /api/onboarding-requests", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await GET(createRequest("GET", "/api/onboarding-requests"));
    expect(res.status).toBe(401);
  });

  it("is forbidden for a member (state manager tier only)", async () => {
    mockSession({ id: "m1", name: "Director", role: "member" });
    const res = await GET(createRequest("GET", "/api/onboarding-requests"));
    expect(res.status).toBe(403);
  });

  it("is forbidden for staff", async () => {
    mockSession({ id: "s1", name: "Staff", role: "staff" });
    const res = await GET(createRequest("GET", "/api/onboarding-requests"));
    expect(res.status).toBe(403);
  });

  it("head_office (state manager) can list requests", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });
    prismaMock.newStarterRequest.findMany.mockResolvedValue([]);
    const res = await GET(createRequest("GET", "/api/onboarding-requests"));
    expect(res.status).toBe(200);
  });

  it("admin sees the full history, not just their own submissions", async () => {
    mockSession({ id: "admin-1", name: "Admin", role: "admin" });
    prismaMock.newStarterRequest.findMany.mockResolvedValue([
      { id: "r1", requestedById: "someone-else" },
    ]);
    const res = await GET(createRequest("GET", "/api/onboarding-requests"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requests).toHaveLength(1);
  });
});

describe("POST /api/onboarding-requests", () => {
  it("returns 401 when not authenticated", async () => {
    mockNoSession();
    const res = await POST(createRequest("POST", "/api/onboarding-requests", { body: baseRequest }));
    expect(res.status).toBe(401);
  });

  it("is forbidden for staff", async () => {
    mockSession({ id: "s1", name: "Staff", role: "staff" });
    const res = await POST(createRequest("POST", "/api/onboarding-requests", { body: baseRequest }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when required fields are missing", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });
    const res = await POST(
      createRequest("POST", "/api/onboarding-requests", { body: { fullName: "Only a name" } }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid email", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });
    const res = await POST(
      createRequest("POST", "/api/onboarding-requests", { body: { ...baseRequest, email: "not-an-email" } }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for a custom award level with no label", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });
    const res = await POST(
      createRequest("POST", "/api/onboarding-requests", {
        body: { ...baseRequest, awardLevel: "custom" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when the service doesn't exist", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });
    prismaMock.service.findUnique.mockResolvedValue(null);
    const res = await POST(createRequest("POST", "/api/onboarding-requests", { body: baseRequest }));
    expect(res.status).toBe(400);
  });

  it("returns 409 when an account with that email already exists", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });
    prismaMock.user.findUnique.mockImplementation((args: unknown) => {
      const a = args as { where?: { id?: string; email?: string } };
      if (a?.where?.id) return Promise.resolve({ id: a.where.id, active: true });
      if (a?.where?.email) return Promise.resolve({ id: "existing-user" });
      return Promise.resolve(null);
    });
    const res = await POST(createRequest("POST", "/api/onboarding-requests", { body: baseRequest }));
    expect(res.status).toBe(409);
  });

  it("creates the real account, seeds onboarding, emails the new hire, and notifies admin", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });

    const res = await POST(createRequest("POST", "/api/onboarding-requests", { body: baseRequest }));
    expect(res.status).toBe(201);

    // Account created as a new_starter, tied to the right centre.
    const createCall = prismaMock.user.create.mock.calls[0][0];
    expect(createCall.data.email).toBe("amina@example.com");
    expect(createCall.data.role).toBe("staff");
    expect(createCall.data.serviceId).toBe("svc-1");
    expect(createCall.data.phone).toBe("0400 000 000");
    expect(createCall.data.inductionStatus).toBe("new_starter");

    // The NewStarterRequest row is the audit record, already completed.
    const requestCreateCall = prismaMock.newStarterRequest.create.mock.calls[0][0];
    expect(requestCreateCall.data.status).toBe("completed");
    expect(requestCreateCall.data.completedUserId).toBe("new-user-1");
    expect(requestCreateCall.data.completedById).toBe("hq1");

    expect(prismaMock.activityLog.create).toHaveBeenCalled();
    expect(seedOnboardingPackage).toHaveBeenCalledWith("new-user-1", { serviceId: "svc-1" });
    expect(assignOnboardingPack).not.toHaveBeenCalled(); // no default pack mocked
    expect(sendWelcomeInvite).toHaveBeenCalledWith(
      expect.objectContaining({ email: "amina@example.com", name: "Amina Yusuf" }),
    );
    expect(sendFirstShiftChecklistEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: "amina@example.com", checklistItems: [] }),
    );
    expect(seedNewStarterCheckIns).toHaveBeenCalledWith(
      expect.anything(),
      "new-user-1",
      expect.any(Date),
    );
    expect(notifyNewStarterRequestSubmitted).toHaveBeenCalled();
  });

  it("assigns the centre's default onboarding pack when one exists", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });
    prismaMock.onboardingPack.findFirst.mockResolvedValue({
      id: "pack-1",
      tasks: [{ title: "Upload your WWCC" }, { title: "Read the Code of Conduct" }],
    });

    await POST(createRequest("POST", "/api/onboarding-requests", { body: baseRequest }));

    expect(assignOnboardingPack).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "new-user-1", packId: "pack-1", actorId: "hq1" }),
    );
    expect(sendFirstShiftChecklistEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        checklistItems: ["Upload your WWCC", "Read the Code of Conduct"],
      }),
    );
  });

  it("still completes onboarding when the default pack assignment fails", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });
    prismaMock.onboardingPack.findFirst.mockResolvedValue({ id: "pack-1", tasks: [] });
    vi.mocked(assignOnboardingPack).mockRejectedValueOnce(new Error("already assigned"));

    const res = await POST(createRequest("POST", "/api/onboarding-requests", { body: baseRequest }));
    expect(res.status).toBe(201);
    expect(sendWelcomeInvite).toHaveBeenCalled();
  });

  // ── Invite delivery ───────────────────────────────────────────────
  //
  // 2026-09-14: a State Manager completed an onboarding and the new hire
  // never got their login. sendEmail returns suppression and provider
  // rejection as VALUES rather than throwing, and the invite helper
  // discarded the return value — so a dropped invite was indistinguishable
  // from a delivered one at every layer above.

  it("records a successful invite on the request", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });

    await POST(createRequest("POST", "/api/onboarding-requests", { body: baseRequest }));

    const update = prismaMock.newStarterRequest.update.mock.calls[0][0];
    expect(update.data.inviteStatus).toBe("sent");
    expect(update.data.inviteSentAt).toBeInstanceOf(Date);
  });

  it("records a suppressed invite and still completes the onboarding", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });
    vi.mocked(sendWelcomeInvite).mockResolvedValueOnce({
      status: "suppressed",
      detail: "This address is on the suppression list.",
    });

    const res = await POST(createRequest("POST", "/api/onboarding-requests", { body: baseRequest }));

    // The account, todos and check-ins are too valuable to roll back over
    // an email — but the failure must be recorded, not swallowed.
    expect(res.status).toBe(201);
    const update = prismaMock.newStarterRequest.update.mock.calls[0][0];
    expect(update.data.inviteStatus).toBe("suppressed");
    expect(update.data.inviteError).toMatch(/suppression/i);
    expect(update.data.inviteSentAt).toBeNull();
    expect(seedNewStarterCheckIns).toHaveBeenCalled();
  });

  it("records a provider rejection", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });
    vi.mocked(sendWelcomeInvite).mockResolvedValueOnce({
      status: "rejected",
      detail: "Domain is not verified",
    });

    await POST(createRequest("POST", "/api/onboarding-requests", { body: baseRequest }));

    const update = prismaMock.newStarterRequest.update.mock.calls[0][0];
    expect(update.data.inviteStatus).toBe("rejected");
    expect(update.data.inviteError).toBe("Domain is not verified");
  });

  // ── Onboarding owner to-do ────────────────────────────────────────

  it("creates the owner to-do with the configured owner", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });
    vi.mocked(getOrgSettings).mockResolvedValueOnce({
      onboarding: { ownerUserId: "daniel-1" },
    } as never);

    await POST(createRequest("POST", "/api/onboarding-requests", { body: baseRequest }));

    expect(createOnboardingOwnerTodo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerUserId: "daniel-1",
        fullName: "Amina Yusuf",
        createdById: "hq1",
      }),
    );
  });

  it("passes a null owner through when none is configured", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });

    await POST(createRequest("POST", "/api/onboarding-requests", { body: baseRequest }));

    // The helper no-ops on null; the admin heads-up emails remain the only
    // signal, which is the pre-2026-09-14 behaviour.
    expect(createOnboardingOwnerTodo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ownerUserId: null }),
    );
    expect(notifyNewStarterRequestSubmitted).toHaveBeenCalled();
  });

  it("accepts a payload with no award level", async () => {
    mockSession({ id: "hq1", name: "State Manager", role: "head_office" });

    const res = await POST(
      createRequest("POST", "/api/onboarding-requests", { body: baseRequest }),
    );

    expect(res.status).toBe(201);
    const createCall = prismaMock.newStarterRequest.create.mock.calls[0][0];
    expect(createCall.data.awardLevel).toBeNull();
  });
});

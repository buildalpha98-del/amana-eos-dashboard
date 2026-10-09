/**
 * Staff → Manage staff (2026-10-09). The centre's own account adds and
 * manages ITS staff; it can't make other roles, reach other centres, or
 * read/change private details. Educators can't do any of it.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => Promise.resolve({ limited: false, remaining: 9, resetIn: 0 })) }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "t",
}));
vi.mock("bcryptjs", () => ({ hash: vi.fn(() => "$2a$hashed"), compare: vi.fn(), default: { hash: vi.fn(() => "$2a$hashed") } }));
vi.mock("@/lib/password-breach-check", () => ({ checkPasswordBreach: vi.fn(() => 0) }));
vi.mock("@/lib/audit-log", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/notification-defaults", () => ({ getDefaultNotificationPrefs: vi.fn(() => ({})) }));
vi.mock("@/lib/onboarding-seed", () => ({ seedOnboardingPackage: vi.fn() }));
vi.mock("@/lib/ramp/create", () => ({ createStaffRamp: vi.fn(() => Promise.resolve({})) }));
vi.mock("@/lib/eh-onboarding", () => ({ setUpInEmploymentHeroSafely: vi.fn(() => Promise.resolve(null)) }));
const invite = vi.hoisted(() => ({ sendWelcomeInvite: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/staff-invite", () => invite);
const notify = vi.hoisted(() => ({ notifyUsers: vi.fn(() => Promise.resolve(1)) }));
vi.mock("@/lib/notify-user", () => notify);
vi.mock("@/lib/centre-account", () => ({ findCentreForEmail: vi.fn(() => null), centreAccountCreateFields: vi.fn() }));
vi.mock("@/lib/induction", () => ({ getInductionReadiness: vi.fn(() => Promise.resolve({ ready: false, blockers: [{ kind: "wwcc", label: "Upload your WWCC", href: "/profile" }] })) }));

import { POST as createUser } from "@/app/api/users/route";
import { POST as setPin } from "@/app/api/users/[id]/kiosk-pin/route";
import { PATCH as patchProfile } from "@/app/api/users/[id]/profile/route";
import { GET as inductions } from "@/app/api/services/[id]/staff-inductions/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const centre = () => mockSession({ id: "centre", name: "Greenacre", role: "member", serviceId: "svc-a" });

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockImplementation(async (args: { where: { id?: string; email?: string }; select?: Record<string, unknown> }) => {
    if (args.where.email) return null; // no existing user with that email
    if (args.select && "serviceMemberships" in args.select) {
      return args.where.id === "ed-a"
        ? { serviceId: "svc-a", role: "staff", serviceMemberships: [] }
        : { serviceId: "svc-b", role: "staff", serviceMemberships: [] };
    }
    return { active: true };
  });
  prismaMock.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "new", name: data.name, email: data.email, role: data.role, serviceId: data.serviceId, service: { name: "Greenacre" } }));
  prismaMock.user.findMany.mockResolvedValue([{ id: "office-1" }]);
  prismaMock.user.update.mockResolvedValue({});
  prismaMock.activityLog.create.mockResolvedValue({});
});

describe("the centre adds new staff", () => {
  it("always as an educator, at its own centre, starting induction — and office is told", async () => {
    centre();
    const res = await createUser(
      createRequest("POST", "/api/users", {
        body: { name: "Sarah New", email: "sarah@example.com", role: "admin", serviceId: "svc-b", password: "Sup3r$ecretPassw0rd!" },
      }),
    );
    expect(res.status).toBe(201);
    const data = prismaMock.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ role: "staff", serviceId: "svc-a", inductionStatus: "new_starter" });
    expect(invite.sendWelcomeInvite).toHaveBeenCalled();
    expect(notify.notifyUsers).toHaveBeenCalledWith(expect.anything(), ["office-1"], expect.objectContaining({ title: expect.stringMatching(/New starter/) }));
  });

  it("educators can't add staff", async () => {
    mockSession({ id: "ed", name: "Ed", role: "staff", serviceId: "svc-a" });
    const res = await createUser(createRequest("POST", "/api/users", { body: { name: "X Y", email: "x@example.com" } }));
    expect(res.status).toBe(403);
  });
});

describe("clock-in PINs", () => {
  it("the centre sets a PIN for its own staff", async () => {
    centre();
    const res = await setPin(createRequest("POST", "/x", { body: { pin: "2580" } }), ctx("ed-a"));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update.mock.calls[0][0].data.kioskPinHash).toBeDefined();
  });
  it("not for another centre's staff, and not an obvious PIN", async () => {
    centre();
    expect((await setPin(createRequest("POST", "/x", { body: { pin: "2580" } }), ctx("ed-b"))).status).toBe(403);
    expect((await setPin(createRequest("POST", "/x", { body: { pin: "1234" } }), ctx("ed-a"))).status).toBe(400);
  });
  it("educators can't set someone else's PIN", async () => {
    mockSession({ id: "ed", name: "Ed", role: "staff", serviceId: "svc-a" });
    expect((await setPin(createRequest("POST", "/x", { body: { pin: "2580" } }), ctx("ed-a"))).status).toBe(403);
  });
});

describe("editing details", () => {
  it("the centre can fix a name and phone, nothing private", async () => {
    centre();
    prismaMock.user.update.mockResolvedValue({ id: "ed-a" });
    expect((await patchProfile(createRequest("PATCH", "/x", { body: { name: "Sarah Awad", phone: "0400 000 000" } }), ctx("ed-a"))).status).not.toBe(403);
    expect((await patchProfile(createRequest("PATCH", "/x", { body: { email: "new@example.com" } }), ctx("ed-a"))).status).toBe(403);
    expect((await patchProfile(createRequest("PATCH", "/x", { body: { name: "X" } }), ctx("ed-b"))).status).toBe(403);
  });
});

describe("staff inductions", () => {
  it("lists what each person is missing, for the centre only", async () => {
    centre();
    prismaMock.user.findMany.mockResolvedValue([{ id: "ed-a", name: "Omar", avatar: null, inductionStatus: "in_training", inductionDueDate: null, startDate: null }]);
    const body = await (await inductions(createRequest("GET", "/x"), ctx("svc-a"))).json();
    expect(body.rows[0]).toMatchObject({ name: "Omar", missing: ["Upload your WWCC"] });
    mockSession({ id: "ed", name: "Ed", role: "staff", serviceId: "svc-a" });
    expect((await inductions(createRequest("GET", "/x"), ctx("svc-a"))).status).toBe(403);
  });
});

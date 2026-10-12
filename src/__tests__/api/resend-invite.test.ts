import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
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
// The family app's open/closed switch, flipped per test. These tests cover
// the OPEN app unless they say otherwise; the closed app holds invites.
const app = vi.hoisted(() => ({ open: true }));
vi.mock("@/lib/parent-portal-lockdown", async (orig) => ({
  ...(await orig<typeof import("@/lib/parent-portal-lockdown")>()),
  get PARENT_APP_OPEN() {
    return app.open;
  },
}));
vi.mock("@/lib/notifications/parent-welcome", () => ({
  sendParentWelcomeInvite: vi.fn(),
}));

import { POST } from "@/app/api/centre-contacts/[id]/resend-invite/route";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { sendParentWelcomeInvite } from "@/lib/notifications/parent-welcome";

const CONTACT_ID = "cc-1";
const ctx = { params: Promise.resolve({ id: CONTACT_ID }) };

describe("POST /api/centre-contacts/[id]/resend-invite", () => {
  beforeEach(() => {
    app.open = true;
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  it("401 when not authenticated", async () => {
    mockNoSession();
    const res = await POST(createRequest("POST", `/api/centre-contacts/${CONTACT_ID}/resend-invite`), ctx);
    expect(res.status).toBe(401);
  });

  it("403 when role is not allowed", async () => {
    mockSession({ id: "u1", name: "X", role: "staff", serviceId: "s1" });
    const res = await POST(createRequest("POST", `/api/centre-contacts/${CONTACT_ID}/resend-invite`), ctx);
    expect(res.status).toBe(403);
  });

  it("404 when contact does not exist", async () => {
    mockSession({ id: "u1", name: "X", role: "admin", serviceId: "s1" });
    prismaMock.centreContact.findUnique.mockResolvedValue(null);
    const res = await POST(createRequest("POST", `/api/centre-contacts/${CONTACT_ID}/resend-invite`), ctx);
    expect(res.status).toBe(404);
  });

  it("403 when coordinator is at a different service", async () => {
    mockSession({ id: "u1", name: "X", role: "member", serviceId: "other" });
    prismaMock.centreContact.findUnique.mockResolvedValue({
      id: CONTACT_ID,
      email: "p@y.com",
      serviceId: "s1",
    });
    const res = await POST(createRequest("POST", `/api/centre-contacts/${CONTACT_ID}/resend-invite`), ctx);
    expect(res.status).toBe(403);
  });

  it("owner can resend for any service", async () => {
    mockSession({ id: "u1", name: "X", role: "owner", serviceId: "elsewhere" });
    prismaMock.centreContact.findUnique.mockResolvedValue({
      id: CONTACT_ID,
      email: "p@y.com",
      serviceId: "s1",
    });
    vi.mocked(sendParentWelcomeInvite).mockResolvedValue({
      sent: true,
      email: "p@y.com",
    });
    const res = await POST(createRequest("POST", `/api/centre-contacts/${CONTACT_ID}/resend-invite`), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ sent: true, email: "p@y.com" });
    expect(sendParentWelcomeInvite).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
      resend: true,
    });
  });

  it("500 when email sending fails", async () => {
    mockSession({ id: "u1", name: "X", role: "admin", serviceId: "s1" });
    prismaMock.centreContact.findUnique.mockResolvedValue({
      id: CONTACT_ID,
      email: "p@y.com",
      serviceId: "s1",
    });
    vi.mocked(sendParentWelcomeInvite).mockResolvedValue({
      sent: false,
      email: "p@y.com",
    });
    const res = await POST(createRequest("POST", `/api/centre-contacts/${CONTACT_ID}/resend-invite`), ctx);
    expect(res.status).toBe(500);
  });

  it("409s with an explanation, and sends nothing, while the family app is closed", async () => {
    app.open = false;
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    const res = await POST(createRequest("POST", "/api/centre-contacts/c1/resend-invite"), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/isn't open to families yet/);
    expect(sendParentWelcomeInvite).not.toHaveBeenCalled();
  });
});

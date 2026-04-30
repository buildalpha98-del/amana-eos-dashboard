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
});

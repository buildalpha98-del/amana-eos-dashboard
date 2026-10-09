/**
 * Centre Messages (2026-10-09): a centre's Coordinator / centre login sees
 * its own families' conversations — the same threads as the office Contact
 * Centre — and educators see none.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ limited: false })) }));
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
vi.mock("@/lib/notifications/messaging", () => ({ sendNewMessageNotification: vi.fn() }));

import { GET as listConversations } from "@/app/api/messaging/conversations/route";
import { POST as reply } from "@/app/api/messaging/conversations/[id]/messages/route";
import { GET as listFamilies } from "@/app/api/messaging/families/route";
import { visibleServiceSections } from "@/lib/service-sections";

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.conversation.findMany.mockResolvedValue([]);
  prismaMock.centreContact.findMany.mockResolvedValue([]);
});

describe("educators are kept out of parent messages", () => {
  beforeEach(() => mockSession({ id: "ed", name: "Educator", role: "staff", serviceId: "svc-a" }));

  it("can't list conversations", async () => {
    const res = await listConversations(createRequest("GET", "/api/messaging/conversations?serviceId=svc-a"));
    expect(res.status).toBe(403);
    expect(prismaMock.conversation.findMany).not.toHaveBeenCalled();
  });

  it("can't reply", async () => {
    const res = await reply(
      createRequest("POST", "/api/messaging/conversations/cv1/messages", { body: { body: "hi" } }),
      { params: Promise.resolve({ id: "cv1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("can't list families to message", async () => {
    const res = await listFamilies(createRequest("GET", "/api/messaging/families"));
    expect(res.status).toBe(403);
  });
});

describe("a centre's Coordinator", () => {
  beforeEach(() =>
    mockSession({ id: "co", name: "Greenacre", role: "member", serviceId: "svc-a" }),
  );

  it("sees their own centre's conversations", async () => {
    const res = await listConversations(createRequest("GET", "/api/messaging/conversations?serviceId=svc-a"));
    expect(res.status).toBe(200);
    const where = prismaMock.conversation.findMany.mock.calls[0][0].where;
    expect(where.serviceId).toBe("svc-a");
  });

  it("can't open another centre's", async () => {
    const res = await listConversations(createRequest("GET", "/api/messaging/conversations?serviceId=svc-b"));
    expect(res.status).toBe(403);
  });
});

describe("the centre page's Messages section", () => {
  const base = { isAdminPlus: false, canSeeCasualBookings: true, canSeeStaffFiles: true };
  const keys = (o: Parameters<typeof visibleServiceSections>[0]) =>
    visibleServiceSections(o).map((g) => g.key);

  it("shows for the centre's Coordinator / centre login", () => {
    expect(keys({ ...base, canSeeMessages: true })).toContain("messages");
  });
  it("is hidden from everyone else", () => {
    expect(keys({ ...base, canSeeMessages: false })).not.toContain("messages");
  });
  it("never shows on an educator's menu", () => {
    expect(keys({ ...base, isEducator: true, canSeeMessages: true })).not.toContain("messages");
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
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
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/notifications/messaging", () => ({
  sendNewMessageNotification: vi.fn().mockResolvedValue(undefined),
}));

import { POST as NewConversationPost } from "@/app/api/messaging/conversations/route";
import { POST as StaffReplyPost } from "@/app/api/messaging/conversations/[id]/messages/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const TRUSTED_URL =
  "https://abcd.public.blob.vercel-storage.com/message-attachments/img-1.jpg";
const UNTRUSTED_URL = "https://evil.example.com/image.jpg";

function urls(n: number): string[] {
  return Array.from(
    { length: n },
    (_, i) =>
      `https://abcd.public.blob.vercel-storage.com/message-attachments/img-${i}.jpg`,
  );
}

describe("Staff /api/messaging/conversations — attachment validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.centreContact.findUnique.mockResolvedValue({ id: "fam-1" });
    prismaMock.service.findUnique.mockResolvedValue({ id: "svc-1" });
    prismaMock.conversation.create.mockResolvedValue({
      id: "conv-1",
      messages: [{ id: "msg-1" }],
    });
  });

  it("persists attachmentUrls on new conversation", async () => {
    mockSession({ id: "user-1", name: "Staff", role: "owner" });
    const req = createRequest("POST", "/api/messaging/conversations", {
      body: {
        familyId: "fam-1",
        serviceId: "svc-1",
        subject: "Hello",
        body: "A note",
        attachmentUrls: [TRUSTED_URL],
      },
    });
    const res = await NewConversationPost(req);
    expect(res.status).toBe(201);
    const call = prismaMock.conversation.create.mock.calls.at(-1)?.[0];
    expect(call?.data.messages.create.attachmentUrls).toEqual([TRUSTED_URL]);
  });

  it("rejects untrusted URL on new conversation", async () => {
    mockSession({ id: "user-1", name: "Staff", role: "owner" });
    const req = createRequest("POST", "/api/messaging/conversations", {
      body: {
        familyId: "fam-1",
        serviceId: "svc-1",
        subject: "Hello",
        body: "A note",
        attachmentUrls: [UNTRUSTED_URL],
      },
    });
    const res = await NewConversationPost(req);
    expect(res.status).toBe(400);
  });

  it("rejects > 6 attachments on new conversation", async () => {
    mockSession({ id: "user-1", name: "Staff", role: "owner" });
    const req = createRequest("POST", "/api/messaging/conversations", {
      body: {
        familyId: "fam-1",
        serviceId: "svc-1",
        subject: "Hello",
        body: "A note",
        attachmentUrls: urls(7),
      },
    });
    const res = await NewConversationPost(req);
    expect(res.status).toBe(400);
  });

  it("allows attachment-only new conversation (no body)", async () => {
    mockSession({ id: "user-1", name: "Staff", role: "owner" });
    const req = createRequest("POST", "/api/messaging/conversations", {
      body: {
        familyId: "fam-1",
        serviceId: "svc-1",
        subject: "Photos",
        body: "",
        attachmentUrls: [TRUSTED_URL],
      },
    });
    const res = await NewConversationPost(req);
    expect(res.status).toBe(201);
  });

  it("rejects empty body AND empty attachments", async () => {
    mockSession({ id: "user-1", name: "Staff", role: "owner" });
    const req = createRequest("POST", "/api/messaging/conversations", {
      body: {
        familyId: "fam-1",
        serviceId: "svc-1",
        subject: "Nothing",
        body: "",
      },
    });
    const res = await NewConversationPost(req);
    expect(res.status).toBe(400);
  });
});

describe("Staff /api/messaging/conversations/[id]/messages — attachment validation", () => {
  const ctx = { params: Promise.resolve({ id: "conv-1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
    _clearUserActiveCache();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
    prismaMock.conversation.findUnique.mockResolvedValue({ id: "conv-1" });
    prismaMock.message.create.mockResolvedValue({ id: "msg-1" });
    prismaMock.conversation.update.mockResolvedValue({ id: "conv-1" });
  });

  it("accepts staff reply with six attachments and no body", async () => {
    mockSession({ id: "user-1", name: "Staff", role: "owner" });
    const req = createRequest(
      "POST",
      "/api/messaging/conversations/conv-1/messages",
      { body: { body: "", attachmentUrls: urls(6) } },
    );
    const res = await StaffReplyPost(req, ctx);
    expect(res.status).toBe(201);
  });

  it("rejects staff reply with seven attachments", async () => {
    mockSession({ id: "user-1", name: "Staff", role: "owner" });
    const req = createRequest(
      "POST",
      "/api/messaging/conversations/conv-1/messages",
      { body: { body: "Hi", attachmentUrls: urls(7) } },
    );
    const res = await StaffReplyPost(req, ctx);
    expect(res.status).toBe(400);
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it("rejects untrusted URL in staff reply", async () => {
    mockSession({ id: "user-1", name: "Staff", role: "owner" });
    const req = createRequest(
      "POST",
      "/api/messaging/conversations/conv-1/messages",
      { body: { body: "Hi", attachmentUrls: [UNTRUSTED_URL] } },
    );
    const res = await StaffReplyPost(req, ctx);
    expect(res.status).toBe(400);
  });

  it("persists attachmentUrls on staff reply", async () => {
    mockSession({ id: "user-1", name: "Staff", role: "owner" });
    const req = createRequest(
      "POST",
      "/api/messaging/conversations/conv-1/messages",
      { body: { body: "Check", attachmentUrls: [TRUSTED_URL] } },
    );
    const res = await StaffReplyPost(req, ctx);
    expect(res.status).toBe(201);
    const call = prismaMock.message.create.mock.calls.at(-1)?.[0];
    expect(call?.data.attachmentUrls).toEqual([TRUSTED_URL]);
    expect(call?.data.body).toBe("Check");
  });
});

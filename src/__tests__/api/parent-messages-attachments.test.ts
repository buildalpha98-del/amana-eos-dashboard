import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

// Rate-limit is used inside withParentAuth, but we also stub withParentAuth
// below — still mock it so other imports don't explode.
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

const mockParentPayload = {
  email: "parent@test.com",
  name: "Test Parent",
  enrolmentIds: ["enr-1"],
};
let parentAuthEnabled = true;

vi.mock("@/lib/parent-auth", () => ({
  withParentAuth: (handler: Function) => {
    return async (req: Request, routeContext?: unknown) => {
      if (!parentAuthEnabled) {
        const { NextResponse } = await import("next/server");
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
      const ctx = {
        ...((routeContext as object) ?? {}),
        parent: mockParentPayload,
      };
      try {
        return await handler(req, ctx);
      } catch (err) {
        const { handleApiError } = await import("@/lib/api-handler");
        return handleApiError(req as never, err, "test-req-id");
      }
    };
  },
}));

import { POST as NewMessagePost } from "@/app/api/parent/messages/route";
import { POST as ReplyPost } from "@/app/api/parent/messages/[id]/reply/route";

const TRUSTED_URL_1 =
  "https://abcd.public.blob.vercel-storage.com/message-attachments/img-1.jpg";
const TRUSTED_URL_2 =
  "https://abcd.public.blob.vercel-storage.com/message-attachments/img-2.jpg";
const UNTRUSTED_URL = "https://evil.example.com/image.jpg";

const replyContext = (id: string) => ({ params: Promise.resolve({ id }) });

function urls(n: number): string[] {
  return Array.from(
    { length: n },
    (_, i) =>
      `https://abcd.public.blob.vercel-storage.com/message-attachments/img-${i}.jpg`,
  );
}

describe("POST /api/parent/messages/[id]/reply — attachment validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parentAuthEnabled = true;
    mockParentPayload.enrolmentIds = ["enr-1"];

    // Default parent-ownership wiring so happy-path tests work.
    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: "svc-1" },
    ]);
    prismaMock.centreContact.findMany.mockResolvedValue([
      { id: "contact-1", firstName: "P", lastName: "Parent" },
    ]);
    prismaMock.conversation.findUnique.mockResolvedValue({
      id: "conv-1",
      familyId: "contact-1",
    });
    prismaMock.centreContact.findUnique.mockResolvedValue({
      firstName: "P",
      lastName: "Parent",
    });
    prismaMock.message.create.mockResolvedValue({
      id: "msg-1",
      body: "",
      attachmentUrls: [],
    });
    prismaMock.conversation.update.mockResolvedValue({ id: "conv-1" });
  });

  it("accepts a reply with zero attachments (text only)", async () => {
    const req = createRequest(
      "POST",
      "/api/parent/messages/conv-1/reply",
      { body: { body: "Hi" } },
    );
    const res = await ReplyPost(req, replyContext("conv-1"));
    expect(res.status).toBe(201);
  });

  it("accepts a reply with three attachments and a body", async () => {
    const req = createRequest(
      "POST",
      "/api/parent/messages/conv-1/reply",
      { body: { body: "Some photos", attachmentUrls: urls(3) } },
    );
    const res = await ReplyPost(req, replyContext("conv-1"));
    expect(res.status).toBe(201);
    const call = prismaMock.message.create.mock.calls.at(-1)?.[0];
    expect(call?.data.attachmentUrls).toEqual(urls(3));
  });

  it("accepts a reply with six attachments and no body", async () => {
    const req = createRequest(
      "POST",
      "/api/parent/messages/conv-1/reply",
      { body: { body: "", attachmentUrls: urls(6) } },
    );
    const res = await ReplyPost(req, replyContext("conv-1"));
    expect(res.status).toBe(201);
  });

  it("rejects a reply with seven attachments (over the cap)", async () => {
    const req = createRequest(
      "POST",
      "/api/parent/messages/conv-1/reply",
      { body: { body: "Hi", attachmentUrls: urls(7) } },
    );
    const res = await ReplyPost(req, replyContext("conv-1"));
    expect(res.status).toBe(400);
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it("rejects a non-URL string inside attachmentUrls", async () => {
    const req = createRequest(
      "POST",
      "/api/parent/messages/conv-1/reply",
      { body: { body: "Hi", attachmentUrls: ["not-a-url"] } },
    );
    const res = await ReplyPost(req, replyContext("conv-1"));
    expect(res.status).toBe(400);
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it("rejects an attachment URL from an untrusted domain", async () => {
    const req = createRequest(
      "POST",
      "/api/parent/messages/conv-1/reply",
      {
        body: {
          body: "Hi",
          attachmentUrls: [TRUSTED_URL_1, UNTRUSTED_URL],
        },
      },
    );
    const res = await ReplyPost(req, replyContext("conv-1"));
    expect(res.status).toBe(400);
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it("rejects an empty body with zero attachments", async () => {
    const req = createRequest(
      "POST",
      "/api/parent/messages/conv-1/reply",
      { body: { body: "   " } },
    );
    const res = await ReplyPost(req, replyContext("conv-1"));
    expect(res.status).toBe(400);
  });

  it("persists attachmentUrls on the created Message", async () => {
    const urlsToSend = [TRUSTED_URL_1, TRUSTED_URL_2];
    const req = createRequest(
      "POST",
      "/api/parent/messages/conv-1/reply",
      { body: { body: "Check these", attachmentUrls: urlsToSend } },
    );
    const res = await ReplyPost(req, replyContext("conv-1"));
    expect(res.status).toBe(201);
    const call = prismaMock.message.create.mock.calls.at(-1)?.[0];
    expect(call?.data.attachmentUrls).toEqual(urlsToSend);
    expect(call?.data.body).toBe("Check these");
  });
});

describe("POST /api/parent/messages — attachment validation on new conversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parentAuthEnabled = true;
    mockParentPayload.enrolmentIds = ["enr-1"];

    prismaMock.enrolmentSubmission.findMany.mockResolvedValue([
      { serviceId: "svc-1" },
    ]);
    prismaMock.centreContact.findFirst.mockResolvedValue({
      id: "contact-1",
      firstName: "P",
      lastName: "Parent",
    });
    prismaMock.conversation.create.mockResolvedValue({
      id: "conv-new",
      messages: [{ id: "msg-new", body: "", attachmentUrls: [] }],
    });
  });

  it("allows an attachment-only new conversation", async () => {
    const req = createRequest("POST", "/api/parent/messages", {
      body: {
        subject: "Photos",
        message: "",
        attachmentUrls: [TRUSTED_URL_1],
      },
    });
    const res = await NewMessagePost(req, undefined as never);
    expect(res.status).toBe(201);
    const call = prismaMock.conversation.create.mock.calls.at(-1)?.[0];
    expect(call?.data.messages.create.attachmentUrls).toEqual([TRUSTED_URL_1]);
  });

  it("rejects > 6 attachments on new conversation", async () => {
    const req = createRequest("POST", "/api/parent/messages", {
      body: {
        subject: "Photos",
        message: "Hi",
        attachmentUrls: urls(7),
      },
    });
    const res = await NewMessagePost(req, undefined as never);
    expect(res.status).toBe(400);
    expect(prismaMock.conversation.create).not.toHaveBeenCalled();
  });

  it("rejects untrusted domain in new conversation attachments", async () => {
    const req = createRequest("POST", "/api/parent/messages", {
      body: {
        subject: "Photos",
        message: "Hi",
        attachmentUrls: [UNTRUSTED_URL],
      },
    });
    const res = await NewMessagePost(req, undefined as never);
    expect(res.status).toBe(400);
  });

  it("rejects new conversation with empty message and no attachments", async () => {
    const req = createRequest("POST", "/api/parent/messages", {
      body: {
        subject: "Photos",
        message: "",
      },
    });
    const res = await NewMessagePost(req, undefined as never);
    expect(res.status).toBe(400);
  });
});

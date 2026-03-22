import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";
import crypto from "crypto";

const MOCK_APP_SECRET = "test-app-secret";
const MOCK_VERIFY_TOKEN = "test-verify-token";

// Must be set before any vi.mock factory runs (hoisted)
vi.hoisted(() => {
  process.env.WHATSAPP_VERIFY_TOKEN = "test-verify-token";
});

// Mock whatsapp module
vi.mock("@/lib/whatsapp", () => ({
  verifyWebhookSignature: vi.fn((signature: string, body: string) => {
    const expectedSig = crypto
      .createHmac("sha256", "test-app-secret")
      .update(body)
      .digest("hex");
    return signature === `sha256=${expectedSig}`;
  }),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
  generateRequestId: () => "test-req-id",
}));

import { GET, POST } from "@/app/api/webhooks/whatsapp/route";

function signPayload(body: string): string {
  const sig = crypto
    .createHmac("sha256", MOCK_APP_SECRET)
    .update(body)
    .digest("hex");
  return `sha256=${sig}`;
}

describe("GET /api/webhooks/whatsapp (verification)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns challenge when verify token matches", async () => {
    const req = createRequest(
      "GET",
      `/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${MOCK_VERIFY_TOKEN}&hub.challenge=test-challenge-123`,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("test-challenge-123");
  });

  it("returns 403 when verify token does not match", async () => {
    const req = createRequest(
      "GET",
      "/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=test",
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 when mode is not subscribe", async () => {
    const req = createRequest(
      "GET",
      `/api/webhooks/whatsapp?hub.mode=unsubscribe&hub.verify_token=${MOCK_VERIFY_TOKEN}&hub.challenge=test`,
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 when no params provided", async () => {
    const req = createRequest("GET", "/api/webhooks/whatsapp");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/webhooks/whatsapp (message receipt)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for invalid signature", async () => {
    const body = JSON.stringify({ entry: [] });

    // Create request manually since we need to control headers
    const url = "http://localhost:3000/api/webhooks/whatsapp";
    const req = new (await import("next/server")).NextRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": "sha256=invalidsignature",
      },
      body,
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain("Invalid signature");
  });

  it("returns 200 for valid signature with empty entries", async () => {
    const body = JSON.stringify({ entry: [] });
    const signature = signPayload(body);

    const url = "http://localhost:3000/api/webhooks/whatsapp";
    const req = new (await import("next/server")).NextRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": signature,
      },
      body,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("processes inbound messages with valid signature", async () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: "61400000001", profile: { name: "John" } }],
                messages: [
                  {
                    id: "wamid.123",
                    from: "61400000001",
                    type: "text",
                    text: { body: "Hello" },
                    timestamp: "1711000000",
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    // Mock the DB calls for message handling
    prismaMock.whatsAppContact.findUnique.mockResolvedValue({
      id: "contact-1",
      waId: "61400000001",
      serviceId: null,
    });
    prismaMock.supportTicket.findFirst.mockResolvedValue(null);
    prismaMock.supportTicket.create.mockResolvedValue({
      id: "ticket-1",
      status: "new",
    });
    prismaMock.ticketMessage.create.mockResolvedValue({ id: "msg-1" });

    const url = "http://localhost:3000/api/webhooks/whatsapp";
    const req = new (await import("next/server")).NextRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": signature,
      },
      body,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Verify a new ticket was created
    expect(prismaMock.supportTicket.create).toHaveBeenCalledOnce();
    // Verify message was stored
    expect(prismaMock.ticketMessage.create).toHaveBeenCalledOnce();
  });

  it("handles status updates with valid signature", async () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: "wamid.456", status: "delivered", timestamp: "1711000000" },
                ],
              },
            },
          ],
        },
      ],
    };

    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    prismaMock.ticketMessage.findUnique.mockResolvedValue({
      id: "msg-1",
      waMessageId: "wamid.456",
    });
    prismaMock.ticketMessage.update.mockResolvedValue({});

    const url = "http://localhost:3000/api/webhooks/whatsapp";
    const req = new (await import("next/server")).NextRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": signature,
      },
      body,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prismaMock.ticketMessage.update).toHaveBeenCalledOnce();
  });

  it("returns 401 for missing signature header", async () => {
    const body = JSON.stringify({ entry: [] });

    const url = "http://localhost:3000/api/webhooks/whatsapp";
    const req = new (await import("next/server")).NextRequest(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

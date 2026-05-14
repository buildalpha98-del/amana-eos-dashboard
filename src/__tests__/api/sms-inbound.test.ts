import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { NextRequest } from "next/server";

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

import { POST } from "@/app/api/sms/inbound/route";

function makeFormReq(form: Record<string, string>, opts?: { signature?: string }) {
  const body = new URLSearchParams(form).toString();
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (opts?.signature) headers["x-twilio-signature"] = opts.signature;
  return new NextRequest("https://example.test/api/sms/inbound", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/sms/inbound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TWILIO_AUTH_TOKEN;
    prismaMock.centreContact.findFirst.mockResolvedValue(null);
    prismaMock.parentFeedback.create.mockResolvedValue({});
  });

  it("creates a ParentFeedback row from a Twilio inbound payload", async () => {
    prismaMock.centreContact.findFirst.mockResolvedValue({
      id: "c-1",
      serviceId: "svc-1",
      firstName: "Aysha",
      lastName: "Khan",
    });

    const res = await POST(
      makeFormReq({
        From: "+61412345678",
        To: "+61400000000",
        Body: "Mira had a great first day, thank you!",
        MessageSid: "SM123",
      }),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.parentFeedback.create).toHaveBeenCalledOnce();
    const args = prismaMock.parentFeedback.create.mock.calls[0][0];
    expect(args.data.source).toBe("sms_reply");
    expect(args.data.channel).toBe("sms");
    expect(args.data.fromNumber).toBe("+61412345678");
    expect(args.data.contactId).toBe("c-1");
    expect(args.data.serviceId).toBe("svc-1");
    expect(args.data.parentName).toBe("Aysha Khan");
    expect(args.data.comments).toBe("Mira had a great first day, thank you!");
    expect(args.data.status).toBe("new");
  });

  it("still creates a row when the From number is not a known contact (unknown source)", async () => {
    prismaMock.centreContact.findFirst.mockResolvedValue(null);

    const res = await POST(
      makeFormReq({
        From: "+61499999999",
        To: "+61400000000",
        Body: "Hello?",
        MessageSid: "SM999",
      }),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.parentFeedback.create).toHaveBeenCalledOnce();
    const args = prismaMock.parentFeedback.create.mock.calls[0][0];
    expect(args.data.contactId).toBeNull();
    expect(args.data.serviceId).toBeNull();
    expect(args.data.parentName).toBeNull();
    expect(args.data.fromNumber).toBe("+61499999999");
  });

  it("returns 200 (no DB write) when From or Body is missing", async () => {
    const res = await POST(
      makeFormReq({ From: "+61412345678", MessageSid: "SM-empty" }),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.parentFeedback.create).not.toHaveBeenCalled();
  });

  it("returns 200 (still 2xx) even when the DB write throws — Twilio shouldn't retry", async () => {
    prismaMock.parentFeedback.create.mockRejectedValue(new Error("DB down"));

    const res = await POST(
      makeFormReq({
        From: "+61412345678",
        To: "+61400000000",
        Body: "test",
        MessageSid: "SM-err",
      }),
    );

    expect(res.status).toBe(200);
  });

  it("rejects with 403 when TWILIO_AUTH_TOKEN is set and signature is wrong", async () => {
    process.env.TWILIO_AUTH_TOKEN = "secret-auth-token";

    const res = await POST(
      makeFormReq(
        {
          From: "+61412345678",
          To: "+61400000000",
          Body: "test",
          MessageSid: "SM-bad-sig",
        },
        { signature: "totally-wrong" },
      ),
    );

    expect(res.status).toBe(403);
    expect(prismaMock.parentFeedback.create).not.toHaveBeenCalled();
  });
});

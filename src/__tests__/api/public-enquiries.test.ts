import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

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
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));
vi.mock("@/lib/nurture-scheduler", () => ({
  scheduleNurtureFromStageChange: vi.fn(() => Promise.resolve()),
}));

import { POST as ENQ_POST } from "@/app/api/public/enquiries/route";
import { GET as SVC_GET } from "@/app/api/public/services/[id]/route";
import { checkRateLimit } from "@/lib/rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/public/enquiries", () => {
  it("400 when neither email nor phone provided", async () => {
    const res = await ENQ_POST(
      createRequest("POST", "/api/public/enquiries", {
        body: { serviceId: "s-1", parentName: "Sara" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 when serviceId unknown", async () => {
    prismaMock.service.findUnique.mockResolvedValue(null);
    const res = await ENQ_POST(
      createRequest("POST", "/api/public/enquiries", {
        body: { serviceId: "missing", parentName: "Sara", parentEmail: "s@x.com" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400 when service is closed", async () => {
    prismaMock.service.findUnique.mockResolvedValue({ id: "s-1", status: "closed" });
    const res = await ENQ_POST(
      createRequest("POST", "/api/public/enquiries", {
        body: { serviceId: "s-1", parentName: "Sara", parentEmail: "s@x.com" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates an enquiry with channel=website", async () => {
    prismaMock.service.findUnique.mockResolvedValue({ id: "s-1", status: "active" });
    prismaMock.parentEnquiry.create.mockResolvedValue({ id: "e-1" });
    const res = await ENQ_POST(
      createRequest("POST", "/api/public/enquiries", {
        body: {
          serviceId: "s-1",
          parentName: "Sara Khan",
          parentEmail: "sara@example.com",
          parentPhone: "0400 000 000",
          childName: "Aisha",
          childAge: 7,
          parentDriver: "homework",
          message: "Tuesdays and Thursdays.",
        },
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.enquiryId).toBe("e-1");
    const createArg = prismaMock.parentEnquiry.create.mock.calls[0][0];
    expect(createArg.data.channel).toBe("website");
    expect(createArg.data.parentName).toBe("Sara Khan");
    expect(createArg.data.notes).toContain("Tuesdays and Thursdays.");
  });

  it("links sourceActivationId when utmCampaign matches a known short code", async () => {
    prismaMock.service.findUnique.mockResolvedValue({ id: "s-1", status: "active" });
    prismaMock.campaignActivationAssignment.findUnique.mockResolvedValue({ id: "a-1" });
    prismaMock.parentEnquiry.create.mockResolvedValue({ id: "e-1" });
    const res = await ENQ_POST(
      createRequest("POST", "/api/public/enquiries", {
        body: {
          serviceId: "s-1",
          parentName: "Sara",
          parentEmail: "s@x.com",
          utmCampaign: "abc1234",
          utmSource: "qr",
          utmMedium: "activation",
        },
      }),
    );
    expect(res.status).toBe(201);
    const createArg = prismaMock.parentEnquiry.create.mock.calls[0][0];
    expect(createArg.data.sourceActivationId).toBe("a-1");
    expect(createArg.data.notes).toContain("utm_source=qr");
    expect(createArg.data.notes).toContain("utm_campaign=abc1234");
  });

  it("silently 200s when honeypot field is filled", async () => {
    const res = await ENQ_POST(
      createRequest("POST", "/api/public/enquiries", {
        body: {
          serviceId: "s-1",
          parentName: "bot",
          parentEmail: "bot@x.com",
          website: "http://spam.example",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.parentEnquiry.create).not.toHaveBeenCalled();
  });

  it("429 when rate limit exceeded", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ limited: true, remaining: 0, resetIn: 60 });
    const res = await ENQ_POST(
      createRequest("POST", "/api/public/enquiries", {
        body: { serviceId: "s-1", parentName: "Sara", parentEmail: "s@x.com" },
      }),
    );
    expect(res.status).toBe(429);
  });
});

describe("GET /api/public/services/[id]", () => {
  it("404 when service unknown", async () => {
    prismaMock.service.findUnique.mockResolvedValue(null);
    const res = await SVC_GET(
      createRequest("GET", "/api/public/services/missing"),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
  });

  it("404 when service is closed", async () => {
    prismaMock.service.findUnique.mockResolvedValue({ id: "s-1", name: "Centre A", suburb: "X", state: "NSW", status: "closed" });
    const res = await SVC_GET(
      createRequest("GET", "/api/public/services/s-1"),
      { params: Promise.resolve({ id: "s-1" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns slim shape for active service", async () => {
    prismaMock.service.findUnique.mockResolvedValue({ id: "s-1", name: "Centre A", suburb: "Coburg", state: "VIC", status: "active" });
    const res = await SVC_GET(
      createRequest("GET", "/api/public/services/s-1"),
      { params: Promise.resolve({ id: "s-1" }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ id: "s-1", name: "Centre A", suburb: "Coburg", state: "VIC" });
  });
});

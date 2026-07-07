import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/app/api/_lib/auth", () => ({
  authenticateCowork: vi.fn(() => null),
}));

vi.mock("@/lib/nurture-scheduler", () => ({
  scheduleNurtureFromStageChange: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/activation-attribution", () => ({
  resolveActivationFromUtm: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/enquiry-stage-events", () => ({
  logEnquiryStageEvent: vi.fn(),
}));

vi.mock("@/app/api/cowork/_lib/cowork-activity-log", () => ({
  logCoworkActivity: vi.fn(),
}));

const { POST } = await import("@/app/api/cowork/enquiries/route");

const BASE_BODY = {
  parentName: "Test Parent",
  parentEmail: "parent@example.com",
  parentPhone: "0400 000 000",
  channel: "website",
  notes: "Website enquiry",
};

const CREATED_ENQUIRY = {
  id: "enq-1",
  stage: "new",
  service: { id: "svc-1", name: "Amana OSHC MFIS Greenacre", code: "MFIS-GA" },
};

describe("POST /api/cowork/enquiries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.parentEnquiry.create.mockResolvedValue(CREATED_ENQUIRY as never);
  });

  it("returns 400 when neither serviceId nor serviceCode is provided", async () => {
    const req = createRequest("POST", "/api/cowork/enquiries", {
      body: { ...BASE_BODY },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(prismaMock.parentEnquiry.create).not.toHaveBeenCalled();
  });

  it("returns 400 when both serviceId and serviceCode are provided", async () => {
    const req = createRequest("POST", "/api/cowork/enquiries", {
      body: { ...BASE_BODY, serviceId: "svc-1", serviceCode: "MFIS-GA" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(prismaMock.parentEnquiry.create).not.toHaveBeenCalled();
  });

  it("creates an enquiry via serviceId (existing behaviour)", async () => {
    const req = createRequest("POST", "/api/cowork/enquiries", {
      body: { ...BASE_BODY, serviceId: "svc-1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(prismaMock.service.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.parentEnquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ serviceId: "svc-1", channel: "website" }),
      }),
    );
  });

  it("resolves serviceCode to the service id and creates the enquiry", async () => {
    prismaMock.service.findUnique.mockImplementation(
      ((args: { where: { code?: string } }) =>
        Promise.resolve(
          args.where.code === "MFIS-GA" ? { id: "svc-1" } : null,
        )) as never,
    );

    const req = createRequest("POST", "/api/cowork/enquiries", {
      body: { ...BASE_BODY, serviceCode: "MFIS-GA" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(prismaMock.service.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: "MFIS-GA" } }),
    );
    expect(prismaMock.parentEnquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ serviceId: "svc-1" }),
      }),
    );
  });

  it("returns 400 with a clear message for an unknown serviceCode", async () => {
    prismaMock.service.findUnique.mockResolvedValue(null);

    const req = createRequest("POST", "/api/cowork/enquiries", {
      body: { ...BASE_BODY, serviceCode: "NOT-A-CODE" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("NOT-A-CODE");
    expect(prismaMock.parentEnquiry.create).not.toHaveBeenCalled();
  });
});

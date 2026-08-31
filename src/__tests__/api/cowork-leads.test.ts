import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/app/api/_lib/auth", () => ({
  authenticateCowork: vi.fn(() => null),
}));

vi.mock("@/app/api/cowork/_lib/cowork-activity-log", () => ({
  logCoworkActivity: vi.fn(),
}));

const { POST } = await import("@/app/api/cowork/leads/route");

const CREATED_LEAD = {
  id: "lead-1",
  schoolName: "Test College",
  pipelineStage: "new_lead",
  source: "website",
};

describe("POST /api/cowork/leads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.lead.create.mockResolvedValue(CREATED_LEAD as never);
  });

  it("returns 400 when schoolName is missing", async () => {
    const req = createRequest("POST", "/api/cowork/leads", {
      body: { contactName: "Jane" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(prismaMock.lead.create).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid contact email", async () => {
    const req = createRequest("POST", "/api/cowork/leads", {
      body: { schoolName: "Test College", contactEmail: "not-an-email" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(prismaMock.lead.create).not.toHaveBeenCalled();
  });

  it("creates a website lead at new_lead and folds the role into notes", async () => {
    const req = createRequest("POST", "/api/cowork/leads", {
      body: {
        schoolName: "Test College",
        contactName: "Jane Principal",
        contactEmail: "jane@school.edu",
        contactPhone: "0400 000 000",
        role: "Principal",
        notes: "Prefers a call Tuesday morning.",
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(prismaMock.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolName: "Test College",
          source: "website",
          pipelineStage: "new_lead",
          notes: expect.stringContaining("Role: Principal"),
        }),
      }),
    );
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.lead.pipelineStage).toBe("new_lead");
  });

  it("respects an explicit source when provided", async () => {
    const req = createRequest("POST", "/api/cowork/leads", {
      body: { schoolName: "Test College", source: "referral" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(prismaMock.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: "referral" }),
      }),
    );
  });
});

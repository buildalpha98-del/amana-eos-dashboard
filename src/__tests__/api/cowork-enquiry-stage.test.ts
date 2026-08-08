import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/app/api/_lib/auth", () => ({
  authenticateCowork: vi.fn(() => null),
}));

vi.mock("@/lib/enquiry-stage-events", () => ({
  logEnquiryStageEvent: vi.fn(),
}));

const { PATCH } = await import("@/app/api/cowork/enquiries/[id]/stage/route");
const { logEnquiryStageEvent } = await import("@/lib/enquiry-stage-events");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

describe("PATCH /api/cowork/enquiries/[id]/stage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.parentEnquiry.findUnique.mockResolvedValue({
      stage: "new_enquiry",
      stageChangedAt: new Date("2026-08-01T00:00:00Z"),
    } as never);
    prismaMock.parentEnquiry.update.mockResolvedValue({
      id: "enq-1",
      stage: "nurturing",
      service: { id: "svc-1", name: "Centre A", code: "MFIS-GA" },
    } as never);
  });

  it("moves the enquiry and logs a stage event with the previous stage", async () => {
    const req = createRequest("PATCH", "/api/cowork/enquiries/enq-1/stage", {
      body: { stage: "nurturing" },
    });
    const res = await PATCH(req, ctx("enq-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.previousStage).toBe("new_enquiry");
    expect(logEnquiryStageEvent).toHaveBeenCalledWith("enq-1", "new_enquiry", "nurturing");
  });

  it("does not log an event when the enquiry is not found", async () => {
    prismaMock.parentEnquiry.findUnique.mockResolvedValue(null);

    const req = createRequest("PATCH", "/api/cowork/enquiries/missing/stage", {
      body: { stage: "nurturing" },
    });
    const res = await PATCH(req, ctx("missing"));
    expect(res.status).toBe(404);
    expect(logEnquiryStageEvent).not.toHaveBeenCalled();
  });

  it("does not log an event on validation failure", async () => {
    const req = createRequest("PATCH", "/api/cowork/enquiries/enq-1/stage", {
      body: { stage: "" },
    });
    const res = await PATCH(req, ctx("enq-1"));
    expect(res.status).toBe(400);
    expect(logEnquiryStageEvent).not.toHaveBeenCalled();
  });
});

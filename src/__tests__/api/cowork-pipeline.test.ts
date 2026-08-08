import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/app/api/_lib/auth", () => ({
  authenticateCowork: vi.fn(() => null),
}));

vi.mock("@/lib/enquiry-stage-events", () => ({
  logEnquiryStageEvent: vi.fn(),
}));

const { POST, PUT } = await import("@/app/api/cowork/pipeline/route");
const { logEnquiryStageEvent } = await import("@/lib/enquiry-stage-events");

const SERVICE = { id: "svc-1", name: "Amana OSHC MFIS Greenacre", code: "MFIS-GA" };

const BASE_RECORD = {
  serviceCode: "MFIS-GA",
  stage: "new_enquiry",
  parentName: "Jane Doe",
};

describe("POST /api/cowork/pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.service.findUnique.mockImplementation(
      ((args: { where: { code?: string } }) =>
        Promise.resolve(args.where.code === "MFIS-GA" ? SERVICE : null)) as never,
    );
    prismaMock.parentEnquiry.findFirst.mockResolvedValue(null);
    prismaMock.parentEnquiry.create.mockResolvedValue({ id: "enq-new" } as never);
    prismaMock.parentEnquiry.update.mockResolvedValue({} as never);
  });

  it("logs a creation stage event (fromStage null) for a new enquiry", async () => {
    const req = createRequest("POST", "/api/cowork/pipeline", {
      body: { ...BASE_RECORD },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(logEnquiryStageEvent).toHaveBeenCalledWith("enq-new", null, "new_enquiry");
  });

  it("logs a transition stage event on upsert-update of an existing enquiry", async () => {
    prismaMock.parentEnquiry.findFirst.mockResolvedValue({
      id: "enq-1",
      stage: "new_enquiry",
    } as never);

    const req = createRequest("POST", "/api/cowork/pipeline", {
      body: {
        ...BASE_RECORD,
        stage: "nurturing",
        parentEmail: "jane@test.com",
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(1);
    expect(prismaMock.parentEnquiry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "enq-1" } }),
    );
    expect(logEnquiryStageEvent).toHaveBeenCalledWith("enq-1", "new_enquiry", "nurturing");
  });

  it("logs creation events for every record in a batch", async () => {
    prismaMock.parentEnquiry.create
      .mockResolvedValueOnce({ id: "enq-a" } as never)
      .mockResolvedValueOnce({ id: "enq-b" } as never);

    const req = createRequest("POST", "/api/cowork/pipeline", {
      body: {
        records: [
          { ...BASE_RECORD, parentName: "A" },
          { ...BASE_RECORD, parentName: "B", stage: "info_sent" },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(logEnquiryStageEvent).toHaveBeenCalledWith("enq-a", null, "new_enquiry");
    expect(logEnquiryStageEvent).toHaveBeenCalledWith("enq-b", null, "info_sent");
  });

  it("skips records with unknown service codes without logging events", async () => {
    const req = createRequest("POST", "/api/cowork/pipeline", {
      body: { ...BASE_RECORD, serviceCode: "NOT-A-CODE" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prismaMock.parentEnquiry.create).not.toHaveBeenCalled();
    expect(logEnquiryStageEvent).not.toHaveBeenCalled();
  });
});

describe("PUT /api/cowork/pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.parentEnquiry.findFirst.mockResolvedValue({
      id: "enq-1",
      stage: "info_sent",
    } as never);
    prismaMock.parentEnquiry.update.mockResolvedValue({
      id: "enq-1",
      stage: "nurturing",
      stageChangedAt: new Date(),
    } as never);
  });

  it("logs a transition stage event when the stage changes", async () => {
    const req = createRequest("PUT", "/api/cowork/pipeline", {
      body: { id: "enq-1", stage: "nurturing" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(logEnquiryStageEvent).toHaveBeenCalledWith("enq-1", "info_sent", "nurturing");
  });

  it("does not log an event when the enquiry is not found", async () => {
    prismaMock.parentEnquiry.findFirst.mockResolvedValue(null);

    const req = createRequest("PUT", "/api/cowork/pipeline", {
      body: { id: "missing", stage: "nurturing" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(404);
    expect(logEnquiryStageEvent).not.toHaveBeenCalled();
  });
});

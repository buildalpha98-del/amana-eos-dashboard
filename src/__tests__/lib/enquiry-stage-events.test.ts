import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

import { logEnquiryStageEvent } from "@/lib/enquiry-stage-events";

describe("logEnquiryStageEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.parentEnquiryStageEvent.create.mockResolvedValue({});
  });

  it("writes the transition with from/to stages", async () => {
    await logEnquiryStageEvent("enq-1", "new_enquiry", "info_sent");
    expect(prismaMock.parentEnquiryStageEvent.create).toHaveBeenCalledWith({
      data: { enquiryId: "enq-1", fromStage: "new_enquiry", toStage: "info_sent" },
    });
  });

  it("writes creation events with fromStage=null", async () => {
    await logEnquiryStageEvent("enq-1", null, "new_enquiry");
    expect(
      prismaMock.parentEnquiryStageEvent.create.mock.calls[0][0].data.fromStage,
    ).toBe(null);
  });

  it("no-ops when the stage didn't actually change", async () => {
    await logEnquiryStageEvent("enq-1", "nurturing", "nurturing");
    expect(prismaMock.parentEnquiryStageEvent.create).not.toHaveBeenCalled();
  });

  it("swallows DB failures — history must never fail the write that caused it", async () => {
    prismaMock.parentEnquiryStageEvent.create.mockRejectedValue(new Error("db down"));
    await expect(
      logEnquiryStageEvent("enq-1", "new_enquiry", "cold"),
    ).resolves.toBeUndefined();
  });
});

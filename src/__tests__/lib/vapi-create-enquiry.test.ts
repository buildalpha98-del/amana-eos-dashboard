import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/nurture-scheduler", () => ({
  scheduleNurtureFromStageChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/vapi/centre-resolver", () => ({
  resolveServiceId: vi.fn(),
}));

vi.mock("@/lib/enquiry-stage-events", () => ({
  logEnquiryStageEvent: vi.fn(),
}));

import { createEnquiryFromCall } from "@/lib/vapi/create-enquiry-from-call";
import { resolveServiceId } from "@/lib/vapi/centre-resolver";
import { logEnquiryStageEvent } from "@/lib/enquiry-stage-events";

const CALL = {
  id: "call-1",
  callType: "new_enquiry",
  linkedEnquiryId: null,
  parentName: "Jane Doe",
  parentEmail: "jane@test.com",
  parentPhone: "0400 000 000",
  childName: "Jimmy",
  centreName: "Greenacre",
  callDetails: {},
  callDurationSeconds: 120,
  summary: null,
};

describe("createEnquiryFromCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.vapiCall.findUnique.mockResolvedValue(CALL as never);
    prismaMock.vapiCall.update.mockResolvedValue({} as never);
    prismaMock.parentEnquiry.create.mockResolvedValue({ id: "enq-1" } as never);
    vi.mocked(resolveServiceId).mockResolvedValue("svc-1");
  });

  it("creates the enquiry and logs a creation stage event (fromStage null)", async () => {
    const result = await createEnquiryFromCall("call-1");
    expect(result).toBe("enq-1");
    expect(prismaMock.parentEnquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage: "new_enquiry", channel: "phone" }),
      }),
    );
    expect(logEnquiryStageEvent).toHaveBeenCalledWith("enq-1", null, "new_enquiry");
  });

  it("does not log an event when the centre cannot be resolved", async () => {
    vi.mocked(resolveServiceId).mockResolvedValue(null);

    const result = await createEnquiryFromCall("call-1");
    expect(result).toBeNull();
    expect(prismaMock.parentEnquiry.create).not.toHaveBeenCalled();
    expect(logEnquiryStageEvent).not.toHaveBeenCalled();
  });

  it("does not log an event for non-enquiry call types", async () => {
    prismaMock.vapiCall.findUnique.mockResolvedValue({
      ...CALL,
      callType: "absence",
    } as never);

    const result = await createEnquiryFromCall("call-1");
    expect(result).toBeNull();
    expect(logEnquiryStageEvent).not.toHaveBeenCalled();
  });
});

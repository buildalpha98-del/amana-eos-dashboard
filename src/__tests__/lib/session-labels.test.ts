import { describe, it, expect } from "vitest";
import {
  SESSION_LABELS,
  SESSION_ORDER,
  BOOKING_TYPE_LABELS,
} from "@/lib/session-labels";

describe("session-labels", () => {
  it("uses Amana branded names for each session type", () => {
    expect(SESSION_LABELS.bsc).toBe("Rise and Shine Club (BSC)");
    expect(SESSION_LABELS.asc).toBe("Amana Afternoons (ASC)");
    expect(SESSION_LABELS.vc).toBe("Holiday Quest (VC)");
  });

  it("orders sessions bsc -> asc -> vc so vc can be hidden by slicing", () => {
    expect(SESSION_ORDER).toEqual(["bsc", "asc", "vc"]);
  });

  it("exposes booking type labels used by the weekly grid", () => {
    expect(BOOKING_TYPE_LABELS.permanent).toBe("Permanent");
    expect(BOOKING_TYPE_LABELS.casual).toBe("Casual");
  });
});

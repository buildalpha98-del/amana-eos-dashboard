import { describe, it, expect } from "vitest";
import { resolveCommunicationTab } from "@/lib/communication-tabs";

describe("resolveCommunicationTab", () => {
  it("resolves valid tab params (cascade deep-links depend on this)", () => {
    expect(resolveCommunicationTab("cascade")).toBe("cascade");
    expect(resolveCommunicationTab("pulse")).toBe("pulse");
    expect(resolveCommunicationTab("announcements")).toBe("announcements");
  });

  it("falls back to announcements for anything else", () => {
    expect(resolveCommunicationTab(null)).toBe("announcements");
    expect(resolveCommunicationTab(undefined)).toBe("announcements");
    expect(resolveCommunicationTab("evil")).toBe("announcements");
    expect(resolveCommunicationTab("")).toBe("announcements");
  });
});

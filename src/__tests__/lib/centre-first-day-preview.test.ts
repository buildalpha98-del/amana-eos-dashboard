/**
 * The centre's "booked in" email can be test-sent from the Parent Journey
 * page (Daniel, 20 Oct 2026) — same builder as the real alert.
 */
import { describe, expect, it, vi } from "vitest";
import "../helpers/prisma-mock";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "req",
}));

import { renderJourneyEmail } from "@/lib/parent-journey-preview";
import { PREVIEWABLE_EMAIL_IDS } from "@/lib/parent-journey-map";

describe("centre first-day email preview", () => {
  it("is test-sendable, names the first day and attaches the Proven Process", async () => {
    expect(PREVIEWABLE_EMAIL_IDS).toContain("centre_first_day");
    const out = await renderJourneyEmail("centre_first_day", null);
    expect(out?.subject).toMatch(/^Booked in: Yusuf's first day is \w+day \d+ \w+$/);
    expect(out?.html).toContain("Amana Proven Process");
    expect(out?.html).toContain("Just in case you don't have it handy");
    expect(out?.attachments?.[0]).toMatchObject({ filename: "Amana Proven Process.png" });
    expect(out?.attachments?.[0].path).toMatch(/\/Amana_PP\.png$/);
  });
});

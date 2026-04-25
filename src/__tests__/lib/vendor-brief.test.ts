import { describe, it, expect } from "vitest";
import { formatBriefNumber } from "@/lib/vendor-brief/brief-number";
import {
  addBusinessDays,
  businessDaysBetween,
  isWeekend,
} from "@/lib/vendor-brief/business-days";
import { computeSlaState } from "@/lib/vendor-brief/sla";
import {
  dataForTransition,
  fillIntermediateTimestamps,
  isTerminal,
  isValidTransition,
} from "@/lib/vendor-brief/transitions";

describe("vendor-brief/brief-number", () => {
  it("formats year + zero-padded sequence", () => {
    expect(formatBriefNumber(2026, 1)).toBe("VB-2026-0001");
    expect(formatBriefNumber(2026, 42)).toBe("VB-2026-0042");
    expect(formatBriefNumber(2026, 9999)).toBe("VB-2026-9999");
  });

  it("handles 5-digit overflow without truncating", () => {
    // Pad to 4 but allow longer if needed
    expect(formatBriefNumber(2026, 12345)).toBe("VB-2026-12345");
  });
});

describe("vendor-brief/business-days", () => {
  it("identifies weekends", () => {
    // 2026-04-25 is a Saturday
    expect(isWeekend(new Date("2026-04-25T00:00:00Z"))).toBe(true);
    expect(isWeekend(new Date("2026-04-26T00:00:00Z"))).toBe(true);
    expect(isWeekend(new Date("2026-04-27T00:00:00Z"))).toBe(false);
  });

  it("addBusinessDays skips Sat/Sun", () => {
    const friday = new Date("2026-04-24T00:00:00Z");
    // +1 BD from Fri = Mon (skip Sat + Sun)
    const monday = addBusinessDays(friday, 1);
    expect(monday.toISOString().slice(0, 10)).toBe("2026-04-27");
    // +5 BD from Fri = next Fri
    const nextFriday = addBusinessDays(friday, 5);
    expect(nextFriday.toISOString().slice(0, 10)).toBe("2026-05-01");
  });

  it("addBusinessDays with 0 returns a clone of the input", () => {
    const d = new Date("2026-04-24T00:00:00Z");
    const out = addBusinessDays(d, 0);
    expect(out.getTime()).toBe(d.getTime());
    expect(out).not.toBe(d);
  });

  it("businessDaysBetween counts BDs between two dates", () => {
    const friday = new Date("2026-04-24T00:00:00Z");
    const monday = new Date("2026-04-27T00:00:00Z");
    expect(businessDaysBetween(friday, monday)).toBe(1);
  });
});

describe("vendor-brief/sla", () => {
  const briefSentAt = new Date("2026-04-20T10:00:00Z"); // a Monday

  it("returns on_track when nothing is overdue", () => {
    const now = new Date("2026-04-20T12:00:00Z"); // 2h later
    expect(
      computeSlaState(
        {
          status: "brief_sent",
          briefSentAt,
          acknowledgedAt: null,
          quoteReceivedAt: null,
          deliveryDeadline: null,
          deliveredAt: null,
        },
        now,
      ),
    ).toBe("on_track");
  });

  it("returns ack_overdue at 49 hours with no acknowledgement", () => {
    const now = new Date(briefSentAt.getTime() + 49 * 60 * 60 * 1000);
    expect(
      computeSlaState(
        {
          status: "brief_sent",
          briefSentAt,
          acknowledgedAt: null,
          quoteReceivedAt: null,
          deliveryDeadline: null,
          deliveredAt: null,
        },
        now,
      ),
    ).toBe("ack_overdue");
  });

  it("ack_overdue clears once acknowledgedAt is set", () => {
    const now = new Date(briefSentAt.getTime() + 49 * 60 * 60 * 1000);
    expect(
      computeSlaState(
        {
          status: "awaiting_quote",
          briefSentAt,
          acknowledgedAt: new Date(briefSentAt.getTime() + 47 * 60 * 60 * 1000),
          quoteReceivedAt: null,
          deliveryDeadline: null,
          deliveredAt: null,
        },
        now,
      ),
    ).toBe("on_track");
  });

  it("returns quote_overdue after 5 BD with no quote", () => {
    // briefSentAt is Mon. +5 BD = next Mon. Now = Tue after.
    const now = new Date("2026-04-28T10:00:00Z"); // a Tuesday > 5 BD later
    expect(
      computeSlaState(
        {
          status: "awaiting_quote",
          briefSentAt,
          acknowledgedAt: new Date(briefSentAt.getTime() + 24 * 60 * 60 * 1000),
          quoteReceivedAt: null,
          deliveryDeadline: null,
          deliveredAt: null,
        },
        now,
      ),
    ).toBe("quote_overdue");
  });

  it("returns delivery_overdue when past deadline and not delivered", () => {
    const now = new Date("2026-05-15T00:00:00Z");
    expect(
      computeSlaState(
        {
          status: "ordered",
          briefSentAt,
          acknowledgedAt: briefSentAt,
          quoteReceivedAt: briefSentAt,
          deliveryDeadline: new Date("2026-05-10T00:00:00Z"),
          deliveredAt: null,
        },
        now,
      ),
    ).toBe("delivery_overdue");
  });

  it("returns breached when multiple SLAs overdue", () => {
    const now = new Date("2026-05-15T00:00:00Z");
    expect(
      computeSlaState(
        {
          status: "brief_sent",
          briefSentAt,
          acknowledgedAt: null,
          quoteReceivedAt: null,
          deliveryDeadline: new Date("2026-05-10T00:00:00Z"),
          deliveredAt: null,
        },
        now,
      ),
    ).toBe("breached");
  });

  it("terminal statuses always on_track regardless of dates", () => {
    const now = new Date("2026-12-31T00:00:00Z");
    for (const status of ["delivered", "installed", "cancelled"]) {
      expect(
        computeSlaState(
          {
            status,
            briefSentAt,
            acknowledgedAt: null,
            quoteReceivedAt: null,
            deliveryDeadline: new Date("2026-04-20T00:00:00Z"),
            deliveredAt: null,
          },
          now,
        ),
      ).toBe("on_track");
    }
  });
});

describe("vendor-brief/transitions", () => {
  it("isTerminal recognises terminal statuses", () => {
    expect(isTerminal("delivered")).toBe(true);
    expect(isTerminal("installed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("draft")).toBe(false);
  });

  it("allows forward transitions through the lifecycle", () => {
    expect(isValidTransition("draft", "brief_sent")).toBe(true);
    expect(isValidTransition("brief_sent", "awaiting_quote")).toBe(true);
    expect(isValidTransition("brief_sent", "quote_received")).toBe(true); // skip
    expect(isValidTransition("approved", "ordered")).toBe(true);
    expect(isValidTransition("delivered", "installed")).toBe(true);
  });

  it("rejects backward transitions", () => {
    expect(isValidTransition("ordered", "approved")).toBe(false);
    expect(isValidTransition("delivered", "ordered")).toBe(false);
  });

  it("rejects transitions out of terminal states (except cancellation, which is itself terminal)", () => {
    expect(isValidTransition("delivered", "draft")).toBe(false);
    expect(isValidTransition("cancelled", "draft")).toBe(false);
    expect(isValidTransition("installed", "delivered")).toBe(false);
  });

  it("allows cancellation from any non-terminal state", () => {
    expect(isValidTransition("draft", "cancelled")).toBe(true);
    expect(isValidTransition("approved", "cancelled")).toBe(true);
    expect(isValidTransition("ordered", "cancelled")).toBe(true);
    expect(isValidTransition("delivered", "cancelled")).toBe(false); // already terminal
  });

  it("only allows installed from delivered", () => {
    expect(isValidTransition("delivered", "installed")).toBe(true);
    expect(isValidTransition("ordered", "installed")).toBe(false);
    expect(isValidTransition("approved", "installed")).toBe(false);
  });

  it("dataForTransition sets the right timestamp", () => {
    const t = new Date("2026-04-25T10:00:00Z");
    expect(dataForTransition("brief_sent", t)).toMatchObject({
      status: "brief_sent",
      briefSentAt: t,
    });
    expect(dataForTransition("quote_received", t)).toMatchObject({
      status: "quote_received",
      quoteReceivedAt: t,
    });
    expect(dataForTransition("approved", t)).toMatchObject({
      status: "approved",
      approvedAt: t,
      quoteApprovedAt: t,
    });
  });

  it("fillIntermediateTimestamps backfills missing earlier-stage fields", () => {
    const t = new Date("2026-04-25T10:00:00Z");
    // Skip from draft straight to quote_received — should fill briefSentAt
    // AND acknowledgedAt with the same timestamp.
    const filled = fillIntermediateTimestamps("quote_received", t, {
      briefSentAt: null,
      acknowledgedAt: null,
      quoteReceivedAt: null,
      quoteApprovedAt: null,
      approvedAt: null,
      orderedAt: null,
      deliveredAt: null,
      installedAt: null,
    });
    expect(filled.briefSentAt).toEqual(t);
    expect(filled.acknowledgedAt).toEqual(t);
    expect(filled.quoteReceivedAt).toEqual(t);
  });

  it("fillIntermediateTimestamps does NOT overwrite existing earlier timestamps", () => {
    const earlier = new Date("2026-04-20T10:00:00Z");
    const now = new Date("2026-04-25T10:00:00Z");
    const filled = fillIntermediateTimestamps("approved", now, {
      briefSentAt: earlier,
      acknowledgedAt: earlier,
      quoteReceivedAt: earlier,
      quoteApprovedAt: null,
      approvedAt: null,
      orderedAt: null,
      deliveredAt: null,
      installedAt: null,
    });
    // Should NOT overwrite the earlier briefSentAt etc.
    expect(filled.briefSentAt).toBeUndefined();
    expect(filled.acknowledgedAt).toBeUndefined();
    expect(filled.quoteReceivedAt).toBeUndefined();
    // Should set approvedAt
    expect(filled.approvedAt).toEqual(now);
  });
});

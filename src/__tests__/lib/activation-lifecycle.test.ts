import { describe, it, expect } from "vitest";
import { planTransition, isInFlight, isArchived, STAGE_ORDER } from "@/lib/activation-lifecycle";

describe("STAGE_ORDER", () => {
  it("excludes cancelled (it's not on the linear path)", () => {
    expect(STAGE_ORDER).not.toContain("cancelled");
    expect(STAGE_ORDER[0]).toBe("concept");
    expect(STAGE_ORDER[STAGE_ORDER.length - 1]).toBe("recap_published");
  });
});

describe("planTransition — happy path forward moves", () => {
  it("concept → approved sets conceptApprovedAt", () => {
    const now = new Date("2026-04-28T10:00:00Z");
    const result = planTransition("concept", "approved", { occurredAt: now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.lifecycleStage).toBe("approved");
    expect(result.patch.conceptApprovedAt).toEqual(now);
    expect(result.patch.logisticsStartedAt).toBeUndefined();
  });

  it("logistics → final_push sets finalPushStartedAt only", () => {
    const now = new Date("2026-04-28T10:00:00Z");
    const result = planTransition("logistics", "final_push", { occurredAt: now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.finalPushStartedAt).toEqual(now);
    expect(result.patch.conceptApprovedAt).toBeUndefined();
  });

  it("final_push → delivered requires actualAttendance", () => {
    const result = planTransition("final_push", "delivered", { occurredAt: new Date() });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/actualAttendance/);
  });

  it("final_push → delivered with actualAttendance succeeds", () => {
    const now = new Date("2026-04-28T10:00:00Z");
    const result = planTransition("final_push", "delivered", { occurredAt: now, actualAttendance: 24, enquiriesGenerated: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.activationDeliveredAt).toEqual(now);
    expect(result.patch.actualAttendance).toBe(24);
    expect(result.patch.enquiriesGenerated).toBe(5);
  });

  it("delivered → recap_published requires recapPostId", () => {
    const result = planTransition("delivered", "recap_published", { occurredAt: new Date() });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/recapPostId/);
  });

  it("delivered → recap_published with recapPostId succeeds", () => {
    const now = new Date("2026-04-28T10:00:00Z");
    const result = planTransition("delivered", "recap_published", { occurredAt: now, recapPostId: "post-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.recapPublishedAt).toEqual(now);
  });
});

describe("planTransition — forward jumps fill intermediate timestamps", () => {
  it("concept → final_push fills approved + logistics timestamps", () => {
    const now = new Date("2026-04-28T10:00:00Z");
    const result = planTransition("concept", "final_push", { occurredAt: now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.lifecycleStage).toBe("final_push");
    expect(result.patch.conceptApprovedAt).toEqual(now);
    expect(result.patch.logisticsStartedAt).toEqual(now);
    expect(result.patch.finalPushStartedAt).toEqual(now);
  });

  it("concept → delivered fills 4 intermediate timestamps", () => {
    const now = new Date("2026-04-28T10:00:00Z");
    const result = planTransition("concept", "delivered", { occurredAt: now, actualAttendance: 30 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.conceptApprovedAt).toEqual(now);
    expect(result.patch.logisticsStartedAt).toEqual(now);
    expect(result.patch.finalPushStartedAt).toEqual(now);
    expect(result.patch.activationDeliveredAt).toEqual(now);
  });
});

describe("planTransition — invalid moves", () => {
  it("rejects same-stage", () => {
    const r = planTransition("concept", "concept");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/already at stage/);
  });

  it("rejects backwards", () => {
    const r = planTransition("approved", "concept");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/backwards/);
  });

  it("rejects out-of-cancelled", () => {
    const r = planTransition("cancelled", "delivered");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/Cancelled/);
  });
});

describe("planTransition — cancellation", () => {
  it("requires reason", () => {
    const r = planTransition("approved", "cancelled");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/reason/);
  });

  it("succeeds from any non-cancelled stage with reason", () => {
    const now = new Date("2026-04-28T10:00:00Z");
    const r = planTransition("logistics", "cancelled", { occurredAt: now, cancellationReason: "venue fell through" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.patch.lifecycleStage).toBe("cancelled");
    expect(r.patch.cancelledAt).toEqual(now);
    expect(r.patch.cancellationReason).toBe("venue fell through");
  });

  it("rejects whitespace-only reason", () => {
    const r = planTransition("logistics", "cancelled", { cancellationReason: "   " });
    expect(r.ok).toBe(false);
  });
});

describe("isInFlight / isArchived", () => {
  it("isInFlight true for concept..final_push", () => {
    for (const s of ["concept", "approved", "logistics", "final_push"] as const) {
      expect(isInFlight(s)).toBe(true);
      expect(isArchived(s)).toBe(false);
    }
  });
  it("isArchived true for delivered/recap/cancelled", () => {
    for (const s of ["delivered", "recap_published", "cancelled"] as const) {
      expect(isArchived(s)).toBe(true);
      expect(isInFlight(s)).toBe(false);
    }
  });
});

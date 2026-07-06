import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

import { computeObservedStageRates, MIN_RESOLVED_JOURNEYS } from "@/lib/funnel-rates";
import { forecastPipeline } from "@/lib/forecast";

/** Build events for one resolved journey through the given stages. */
function journey(enquiryId: string, stages: string[], finalStage: string) {
  const events = [];
  let prev: string | null = null;
  for (const stage of stages) {
    events.push({
      enquiryId,
      fromStage: prev,
      toStage: stage,
      enquiry: { stage: finalStage },
    });
    prev = stage;
  }
  return events;
}

describe("computeObservedStageRates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null with no events", async () => {
    prismaMock.parentEnquiryStageEvent.findMany.mockResolvedValue([]);
    expect(await computeObservedStageRates()).toBeNull();
  });

  it("returns null below the minimum resolved-journey sample", async () => {
    const events = [];
    for (let i = 0; i < MIN_RESOLVED_JOURNEYS - 1; i++) {
      events.push(...journey(`enq-${i}`, ["new_enquiry", "info_sent"], "enrolled"));
    }
    prismaMock.parentEnquiryStageEvent.findMany.mockResolvedValue(events);
    expect(await computeObservedStageRates()).toBeNull();
  });

  it("computes per-stage conversion from distinct journeys", async () => {
    const events = [];
    // 20 journeys reach form_started and enrol; 10 go cold from nurturing;
    // 10 more go cold straight from new_enquiry.
    for (let i = 0; i < 20; i++) {
      events.push(
        ...journey(`win-${i}`, ["new_enquiry", "nurturing", "form_started", "enrolled"], "enrolled"),
      );
    }
    for (let i = 0; i < 10; i++) {
      events.push(...journey(`lost-${i}`, ["new_enquiry", "nurturing", "cold"], "cold"));
    }
    for (let i = 0; i < 10; i++) {
      events.push(...journey(`bounce-${i}`, ["new_enquiry", "cold"], "cold"));
    }
    prismaMock.parentEnquiryStageEvent.findMany.mockResolvedValue(events);

    const rates = await computeObservedStageRates();
    expect(rates).not.toBeNull();
    expect(rates!.sampleSize).toBe(40);
    // new_enquiry touched by all 40, 20 converted → 0.5
    expect(rates!.byStage.new_enquiry).toBeCloseTo(0.5);
    // nurturing touched by 30, 20 converted → 0.67
    expect(rates!.byStage.nurturing).toBeCloseTo(0.67);
    // form_started touched by 20, all converted → 1.0 (capped downstream)
    expect(rates!.byStage.form_started).toBeCloseTo(1.0);
  });

  it("leaves thin stages undefined so the caller keeps the heuristic", async () => {
    const events = [];
    for (let i = 0; i < 40; i++) {
      events.push(...journey(`e-${i}`, ["new_enquiry"], i % 2 ? "enrolled" : "cold"));
    }
    // Only 2 journeys ever touched info_sent — below the per-stage floor.
    events.push(...journey("rare-1", ["new_enquiry", "info_sent"], "enrolled"));
    events.push(...journey("rare-2", ["new_enquiry", "info_sent"], "cold"));
    prismaMock.parentEnquiryStageEvent.findMany.mockResolvedValue(events);

    const rates = await computeObservedStageRates();
    expect(rates!.byStage.new_enquiry).toBeDefined();
    expect(rates!.byStage.info_sent).toBeUndefined();
  });
});

describe("forecastPipeline with observed rates", () => {
  it("prefers observed rates per stage and reports the source", () => {
    const p = forecastPipeline(
      { new_enquiry: 10, form_started: 2 },
      40,
      60,
      { sampleSize: 50, byStage: { new_enquiry: 0.5 } },
    );
    expect(p.ratesSource).toBe("observed");
    expect(p.observedSampleSize).toBe(50);
    const byStage = Object.fromEntries(p.byStage.map((s) => [s.stage, s]));
    // Observed 0.5 beats heuristic 0.4×0.6=0.24.
    expect(byStage.new_enquiry.rate).toBeCloseTo(0.5);
    expect(byStage.new_enquiry.source).toBe("observed");
    // form_started had no observed rate → heuristic 0.4×1.6=0.64.
    expect(byStage.form_started.rate).toBeCloseTo(0.64);
    expect(byStage.form_started.source).toBe("heuristic");
  });

  it("caps observed rates at 95% like heuristic ones", () => {
    const p = forecastPipeline(
      { form_started: 3 },
      1,
      99,
      { sampleSize: 100, byStage: { form_started: 1.0 } },
    );
    expect(p.byStage.find((s) => s.stage === "form_started")!.rate).toBeLessThanOrEqual(0.95);
  });

  it("stays fully heuristic when observed is null", () => {
    const p = forecastPipeline({ nurturing: 5 }, 40, 60, null);
    expect(p.ratesSource).toBe("heuristic");
    expect(p.observedSampleSize).toBeNull();
  });
});

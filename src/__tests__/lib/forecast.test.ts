import { describe, it, expect } from "vitest";
import {
  linearFit,
  forecastOccupancy,
  forecastPipeline,
  deriveAlerts,
  MIN_HISTORY_WEEKS,
  type WeekPoint,
} from "@/lib/forecast";

function weeks(values: number[], startIso = "2026-04-06"): WeekPoint[] {
  const start = new Date(`${startIso}T00:00:00.000Z`);
  return values.map((value, i) => ({
    weekStart: new Date(start.getTime() + i * 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
    value,
  }));
}

describe("linearFit", () => {
  it("fits a perfect line exactly", () => {
    const { slope, intercept } = linearFit([10, 12, 14, 16]);
    expect(slope).toBeCloseTo(2);
    expect(intercept).toBeCloseTo(10);
  });

  it("returns zero slope for constant series and degenerate inputs", () => {
    expect(linearFit([5, 5, 5]).slope).toBeCloseTo(0);
    expect(linearFit([7]).slope).toBe(0);
    expect(linearFit([]).slope).toBe(0);
  });
});

describe("forecastOccupancy", () => {
  it("returns null with fewer than MIN_HISTORY_WEEKS points", () => {
    expect(
      forecastOccupancy(weeks([30, 31, 32].slice(0, MIN_HISTORY_WEEKS - 1)), 8, 120),
    ).toBeNull();
  });

  it("projects growth, labels the trend, and dates the capacity ETA", () => {
    // +4/week from 80 with capacity 120 → capacity in ~7 weeks from week idx 3.
    const f = forecastOccupancy(weeks([80, 84, 88, 92]), 8, 120)!;
    expect(f.trend).toBe("growing");
    expect(f.slopePerWeek).toBeCloseTo(4);
    expect(f.current).toBe(92);
    expect(f.weeksToCapacity).toBe(7);
    expect(f.points).toHaveLength(8);
    // Projection is clamped at physical capacity.
    expect(f.points[7].projected).toBeLessThanOrEqual(120);
    expect(f.utilisationNow).toBeCloseTo(0.77, 1);
    // Forecast weekStarts continue weekly from the last observed week.
    expect(f.points[0].weekStart).toBe("2026-05-04");
  });

  it("labels declining trends and clamps projections at zero", () => {
    const f = forecastOccupancy(weeks([30, 20, 10, 2]), 8, 120)!;
    expect(f.trend).toBe("declining");
    expect(f.weeksToCapacity).toBeNull();
    expect(f.points.every((p) => p.projected >= 0)).toBe(true);
  });

  it("treats small drift as flat relative to capacity", () => {
    // 0.5/week on a 120-place centre is under the 2% materiality bar.
    const f = forecastOccupancy(weeks([60, 60.5, 61, 61.5]), 8, 120)!;
    expect(f.trend).toBe("flat");
  });

  it("reports weeksToCapacity=0 when already at capacity", () => {
    const f = forecastOccupancy(weeks([118, 119, 120, 121]), 8, 120)!;
    expect(f.weeksToCapacity).toBe(0);
  });

  it("handles unknown capacity — no utilisation, no ETA, absolute trend bar", () => {
    const f = forecastOccupancy(weeks([10, 12, 14, 16]), 4, null)!;
    expect(f.utilisationNow).toBeNull();
    expect(f.weeksToCapacity).toBeNull();
    expect(f.trend).toBe("growing"); // 2/week > 0.5 absolute bar
  });
});

describe("forecastPipeline", () => {
  it("returns null baseRate and zero expectations with no resolved history", () => {
    const p = forecastPipeline({ new_enquiry: 10 }, 0, 0);
    expect(p.baseRate).toBeNull();
    expect(p.expectedEnrolments).toBe(0);
    expect(p.openTotal).toBe(10);
  });

  it("applies the funnel progression multipliers to the blended rate", () => {
    // 40 converted / 100 resolved → base 0.4.
    const p = forecastPipeline(
      { new_enquiry: 10, info_sent: 5, nurturing: 4, form_started: 2 },
      40,
      60,
    );
    expect(p.baseRate).toBeCloseTo(0.4);
    const byStage = Object.fromEntries(p.byStage.map((s) => [s.stage, s]));
    expect(byStage.new_enquiry.rate).toBeCloseTo(0.24); // 0.4 × 0.6
    expect(byStage.form_started.rate).toBeCloseTo(0.64); // 0.4 × 1.6
    // 10×0.24 + 5×0.32 + 4×0.4 + 2×0.64 = 6.88 ≈ 6.9
    expect(p.expectedEnrolments).toBeCloseTo(6.9, 1);
  });

  it("caps hot-stage rates at 95% even with extreme history", () => {
    const p = forecastPipeline({ form_started: 3 }, 99, 1);
    expect(p.byStage.find((s) => s.stage === "form_started")!.rate).toBeLessThanOrEqual(0.95);
  });
});

describe("deriveAlerts", () => {
  const base = {
    slopePerWeek: 4,
    current: 100,
    points: [],
    utilisationNow: 0.85,
  };

  it("raises capacity alerts before under-target, soonest first", () => {
    const alerts = deriveAlerts(
      [
        {
          serviceId: "s-late",
          serviceName: "Later",
          forecast: { ...base, trend: "growing", utilisationAtHorizon: 1, weeksToCapacity: 6 },
        },
        {
          serviceId: "s-under",
          serviceName: "Under",
          forecast: {
            ...base,
            trend: "declining",
            slopePerWeek: -5,
            utilisationAtHorizon: 0.4,
            weeksToCapacity: null,
          },
        },
        {
          serviceId: "s-now",
          serviceName: "Now",
          forecast: { ...base, trend: "growing", utilisationAtHorizon: 1, weeksToCapacity: 2 },
        },
      ],
      8,
    );
    expect(alerts.map((a) => a.serviceId)).toEqual(["s-now", "s-late", "s-under"]);
    expect(alerts[2].kind).toBe("under_target");
  });

  it("stays quiet for healthy centres and missing forecasts", () => {
    const alerts = deriveAlerts(
      [
        {
          serviceId: "s-ok",
          serviceName: "Fine",
          forecast: { ...base, trend: "flat", utilisationAtHorizon: 0.8, weeksToCapacity: null },
        },
        { serviceId: "s-new", serviceName: "New", forecast: null },
      ],
      8,
    );
    expect(alerts).toEqual([]);
  });
});

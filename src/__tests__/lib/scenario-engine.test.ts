import { describe, it, expect } from "vitest";
import {
  calculateScenario,
  formatAUD,
  formatAUDFull,
  DEFAULT_INPUTS,
  INPUT_CONFIG,
  PRESET_SCENARIOS,
  type ScenarioInputs,
} from "@/lib/scenario-engine";

// ─── Helper: build inputs with overrides ────────────────────────────────────
function inputs(overrides: Partial<ScenarioInputs> = {}): ScenarioInputs {
  return { ...DEFAULT_INPUTS, ...overrides };
}

// ─── Pre-computed expected values for DEFAULT_INPUTS ─────────────────────────
// casualFraction = 0.20, regularFraction = 0.80
// annualOperatingDays = 40 * 5 = 200
// bscBlended = 26*0.8 + 31*0.2 = 20.8 + 6.2 = 27.0
// ascBlended = 36*0.8 + 41*0.2 = 28.8 + 8.2 = 37.0
// bscRevPerCentre = 25 * 27 * 200 = 135_000
// ascRevPerCentre = 35 * 37 * 200 = 259_000
// vcRevPerCentre  = 20 * 100 * 40 = 80_000
// annualRevenuePerCentre = 474_000
// bscStaffCost = 2 * 2.5 * 42.56 * 200 = 42_560
// ascStaffCost = 2 * 3.0 * 42.56 * 200 = 51_072
// totalStaffCostPerCentre = 93_632
// centreOverheadAnnual = 8000 * 12 = 96_000
// annualCostPerCentre = 189_632
// profitPerCentre = 474_000 - 189_632 = 284_368
// corporateOverheadAnnual = 40_000 * 12 = 480_000
// totalNetworkRevenue = 474_000 * 15 = 7_110_000
// totalCentresCosts  = 189_632 * 15 = 2_844_480
// totalNetworkCosts  = 2_844_480 + 480_000 = 3_324_480
// totalNetworkProfit = 7_110_000 - 3_324_480 = 3_785_520
// marginPercent = 3_785_520 / 7_110_000 * 100 ≈ 53.24
// breakEvenCentres = ceil(480_000 / 284_368) = ceil(1.688) = 2

describe("calculateScenario", () => {
  describe("default inputs produce expected outputs", () => {
    const result = calculateScenario(DEFAULT_INPUTS);

    it("calculates annualRevenuePerCentre", () => {
      expect(result.annualRevenuePerCentre).toBe(474_000);
    });

    it("calculates annualCostPerCentre", () => {
      expect(result.annualCostPerCentre).toBe(189_632);
    });

    it("calculates annualProfitPerCentre", () => {
      expect(result.annualProfitPerCentre).toBe(284_368);
    });

    it("calculates totalNetworkRevenue", () => {
      expect(result.totalNetworkRevenue).toBe(7_110_000);
    });

    it("calculates totalNetworkCosts", () => {
      expect(result.totalNetworkCosts).toBe(3_324_480);
    });

    it("calculates totalNetworkProfit", () => {
      expect(result.totalNetworkProfit).toBe(3_785_520);
    });

    it("calculates marginPercent", () => {
      expect(result.marginPercent).toBeCloseTo(53.24, 1);
    });

    it("calculates breakEvenCentres", () => {
      expect(result.breakEvenCentres).toBe(2);
    });

    it("calculates valuations", () => {
      expect(result.valuationAt3x).toBe(3_785_520 * 3);
      expect(result.valuationAt5x).toBe(3_785_520 * 5);
      expect(result.valuationAt8x).toBe(3_785_520 * 8);
      expect(result.valuationAt10x).toBe(3_785_520 * 10);
    });

    it("calculates revenue breakdown", () => {
      expect(result.revenueBreakdown.bsc).toBe(135_000 * 15);
      expect(result.revenueBreakdown.asc).toBe(259_000 * 15);
      expect(result.revenueBreakdown.vc).toBe(80_000 * 15);
    });

    it("calculates cost breakdown", () => {
      expect(result.costBreakdown.staff).toBe(93_632 * 15);
      expect(result.costBreakdown.centreOverhead).toBe(96_000 * 15);
      expect(result.costBreakdown.corporateOverhead).toBe(480_000);
    });
  });

  describe("zero centres", () => {
    const result = calculateScenario(inputs({ numCentres: 0 }));

    it("totalNetworkRevenue is zero", () => {
      expect(result.totalNetworkRevenue).toBe(0);
    });

    it("totalNetworkCosts equals corporate overhead only", () => {
      // Centre costs * 0 = 0, but corporate overhead remains
      expect(result.totalNetworkCosts).toBe(480_000);
    });

    it("revenue breakdown is all zeros", () => {
      expect(result.revenueBreakdown.bsc).toBe(0);
      expect(result.revenueBreakdown.asc).toBe(0);
      expect(result.revenueBreakdown.vc).toBe(0);
    });

    it("staff and centre overhead costs are zero", () => {
      expect(result.costBreakdown.staff).toBe(0);
      expect(result.costBreakdown.centreOverhead).toBe(0);
    });
  });

  describe("zero attendance", () => {
    const result = calculateScenario(
      inputs({
        bscAttendancePerDay: 0,
        ascAttendancePerDay: 0,
        vcAttendancePerDay: 0,
      })
    );

    it("revenue is zero", () => {
      expect(result.annualRevenuePerCentre).toBe(0);
      expect(result.totalNetworkRevenue).toBe(0);
    });

    it("costs remain non-zero", () => {
      expect(result.annualCostPerCentre).toBeGreaterThan(0);
      expect(result.totalNetworkCosts).toBeGreaterThan(0);
    });

    it("profit is negative", () => {
      expect(result.totalNetworkProfit).toBeLessThan(0);
    });

    it("margin is zero when revenue is zero", () => {
      expect(result.marginPercent).toBe(0);
    });
  });

  describe("100% casual", () => {
    const result = calculateScenario(inputs({ casualPercentage: 100 }));

    it("blended BSC rate equals casual price", () => {
      // bscBlended = 26*0 + 31*1 = 31
      // bscRev = 25 * 31 * 200 = 155_000
      expect(result.revenueBreakdown.bsc / DEFAULT_INPUTS.numCentres).toBe(
        DEFAULT_INPUTS.bscAttendancePerDay *
          DEFAULT_INPUTS.bscCasualPrice *
          DEFAULT_INPUTS.operatingWeeksPerYear *
          DEFAULT_INPUTS.operatingDaysPerWeek
      );
    });

    it("blended ASC rate equals casual price", () => {
      // ascBlended = 36*0 + 41*1 = 41
      // ascRev = 35 * 41 * 200 = 287_000
      expect(result.revenueBreakdown.asc / DEFAULT_INPUTS.numCentres).toBe(
        DEFAULT_INPUTS.ascAttendancePerDay *
          DEFAULT_INPUTS.ascCasualPrice *
          DEFAULT_INPUTS.operatingWeeksPerYear *
          DEFAULT_INPUTS.operatingDaysPerWeek
      );
    });
  });

  describe("0% casual", () => {
    const result = calculateScenario(inputs({ casualPercentage: 0 }));

    it("blended BSC rate equals regular price", () => {
      expect(result.revenueBreakdown.bsc / DEFAULT_INPUTS.numCentres).toBe(
        DEFAULT_INPUTS.bscAttendancePerDay *
          DEFAULT_INPUTS.bscRegularPrice *
          DEFAULT_INPUTS.operatingWeeksPerYear *
          DEFAULT_INPUTS.operatingDaysPerWeek
      );
    });

    it("blended ASC rate equals regular price", () => {
      expect(result.revenueBreakdown.asc / DEFAULT_INPUTS.numCentres).toBe(
        DEFAULT_INPUTS.ascAttendancePerDay *
          DEFAULT_INPUTS.ascRegularPrice *
          DEFAULT_INPUTS.operatingWeeksPerYear *
          DEFAULT_INPUTS.operatingDaysPerWeek
      );
    });
  });

  describe("negative profit", () => {
    const result = calculateScenario(
      inputs({
        numCentres: 1,
        bscAttendancePerDay: 1,
        ascAttendancePerDay: 1,
        vcAttendancePerDay: 0,
        corporateOverheadPerMonth: 200_000,
      })
    );

    it("break-even is 999 when profit per centre is insufficient", () => {
      // With tiny revenue and huge corporate overhead, profit per centre
      // will be negative or the ratio will be huge
      expect(result.totalNetworkProfit).toBeLessThan(0);
      expect(result.breakEvenCentres).toBe(999);
    });
  });

  describe("zero revenue", () => {
    const result = calculateScenario(
      inputs({
        bscAttendancePerDay: 0,
        ascAttendancePerDay: 0,
        vcAttendancePerDay: 0,
      })
    );

    it("margin is 0", () => {
      expect(result.marginPercent).toBe(0);
    });
  });

  describe("revenue breakdown sums to total network revenue", () => {
    it("for default inputs", () => {
      const result = calculateScenario(DEFAULT_INPUTS);
      const { bsc, asc, vc } = result.revenueBreakdown;
      expect(bsc + asc + vc).toBe(result.totalNetworkRevenue);
    });

    it("for aggressive preset", () => {
      const aggressive = PRESET_SCENARIOS.find((p) => p.key === "aggressive")!;
      const result = calculateScenario(aggressive.inputs);
      const { bsc, asc, vc } = result.revenueBreakdown;
      expect(bsc + asc + vc).toBe(result.totalNetworkRevenue);
    });
  });

  describe("cost breakdown sums to total network costs", () => {
    it("for default inputs", () => {
      const result = calculateScenario(DEFAULT_INPUTS);
      const { staff, centreOverhead, corporateOverhead } = result.costBreakdown;
      expect(staff + centreOverhead + corporateOverhead).toBe(
        result.totalNetworkCosts
      );
    });

    it("for exit30m preset", () => {
      const exit30m = PRESET_SCENARIOS.find((p) => p.key === "exit30m")!;
      const result = calculateScenario(exit30m.inputs);
      const { staff, centreOverhead, corporateOverhead } = result.costBreakdown;
      expect(staff + centreOverhead + corporateOverhead).toBe(
        result.totalNetworkCosts
      );
    });
  });
});

describe("PRESET_SCENARIOS", () => {
  it("has 4 presets", () => {
    expect(PRESET_SCENARIOS).toHaveLength(4);
  });

  it("all produce valid outputs with positive revenue", () => {
    for (const preset of PRESET_SCENARIOS) {
      const result = calculateScenario(preset.inputs);
      expect(result.totalNetworkRevenue).toBeGreaterThan(0);
      expect(result.annualRevenuePerCentre).toBeGreaterThan(0);
      expect(Number.isFinite(result.marginPercent)).toBe(true);
      expect(Number.isFinite(result.breakEvenCentres)).toBe(true);
    }
  });

  it("all have required metadata", () => {
    for (const preset of PRESET_SCENARIOS) {
      expect(preset.key).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.description).toBeTruthy();
    }
  });
});

describe("DEFAULT_INPUTS", () => {
  const requiredKeys: (keyof ScenarioInputs)[] = [
    "numCentres",
    "bscAttendancePerDay",
    "ascAttendancePerDay",
    "vcDaysPerYear",
    "vcAttendancePerDay",
    "bscRegularPrice",
    "bscCasualPrice",
    "ascRegularPrice",
    "ascCasualPrice",
    "vcPrice",
    "bscEducatorsPerCentre",
    "ascEducatorsPerCentre",
    "educatorHourlyRate",
    "overheadPerCentrePerMonth",
    "corporateOverheadPerMonth",
    "casualPercentage",
    "operatingWeeksPerYear",
    "operatingDaysPerWeek",
  ];

  it("has all required fields", () => {
    for (const key of requiredKeys) {
      expect(DEFAULT_INPUTS).toHaveProperty(key);
      expect(typeof DEFAULT_INPUTS[key]).toBe("number");
    }
  });

  it("has no extra fields beyond ScenarioInputs", () => {
    expect(Object.keys(DEFAULT_INPUTS).sort()).toEqual(requiredKeys.sort());
  });
});

describe("INPUT_CONFIG", () => {
  it("covers all ScenarioInputs keys", () => {
    const configKeys = INPUT_CONFIG.map((c) => c.key).sort();
    const inputKeys = Object.keys(DEFAULT_INPUTS).sort();
    expect(configKeys).toEqual(inputKeys);
  });

  it("every entry has valid min < max and step > 0", () => {
    for (const config of INPUT_CONFIG) {
      expect(config.min).toBeLessThan(config.max);
      expect(config.step).toBeGreaterThan(0);
    }
  });

  it("every entry has a non-empty label and group", () => {
    for (const config of INPUT_CONFIG) {
      expect(config.label.length).toBeGreaterThan(0);
      expect(["network", "pricing", "staffing", "overheads"]).toContain(
        config.group
      );
    }
  });
});

describe("formatAUD", () => {
  it("formats millions with one decimal", () => {
    expect(formatAUD(1_000_000)).toBe("$1.0M");
    expect(formatAUD(2_500_000)).toBe("$2.5M");
    expect(formatAUD(7_110_000)).toBe("$7.1M");
  });

  it("formats thousands with no decimals and K suffix", () => {
    expect(formatAUD(1_000)).toBe("$1K");
    expect(formatAUD(50_000)).toBe("$50K");
    expect(formatAUD(999_999)).toBe("$1000K");
  });

  it("formats hundreds as currency without suffix", () => {
    const result = formatAUD(500);
    // Intl.NumberFormat "en-AU" AUD format: A$500 or $500 depending on env
    expect(result).toMatch(/\$500/);
  });

  it("formats zero", () => {
    const result = formatAUD(0);
    expect(result).toMatch(/\$0/);
  });

  it("formats negative millions", () => {
    expect(formatAUD(-2_000_000)).toBe("$-2.0M");
  });

  it("formats negative thousands", () => {
    expect(formatAUD(-50_000)).toBe("$-50K");
  });

  it("formats negative hundreds", () => {
    const result = formatAUD(-500);
    expect(result).toMatch(/-?\$?-?500/);
  });
});

describe("formatAUDFull", () => {
  it("shows full number for millions without abbreviation", () => {
    const result = formatAUDFull(1_000_000);
    // Should contain "1,000,000" or "1 000 000" depending on locale
    expect(result).toMatch(/1[,.]?000[,.]?000/);
  });

  it("shows full number for thousands", () => {
    const result = formatAUDFull(50_000);
    expect(result).toMatch(/50[,.]?000/);
  });

  it("shows full number for small values", () => {
    const result = formatAUDFull(42);
    expect(result).toMatch(/42/);
  });

  it("handles zero", () => {
    const result = formatAUDFull(0);
    expect(result).toMatch(/\$0/);
  });

  it("handles negative values with full format", () => {
    const result = formatAUDFull(-1_500_000);
    expect(result).toMatch(/1[,.]?500[,.]?000/);
  });
});

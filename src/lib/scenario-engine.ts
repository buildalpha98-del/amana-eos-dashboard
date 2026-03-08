// ─── Scenario Modelling Engine ────────────────────────────────────────────────
// Pure TypeScript — zero dependencies, runs client-side for real-time updates.

export interface ScenarioInputs {
  numCentres: number;
  bscAttendancePerDay: number;
  ascAttendancePerDay: number;
  vcDaysPerYear: number;
  vcAttendancePerDay: number;
  bscRegularPrice: number;
  bscCasualPrice: number;
  ascRegularPrice: number;
  ascCasualPrice: number;
  vcPrice: number;
  bscEducatorsPerCentre: number;
  ascEducatorsPerCentre: number;
  educatorHourlyRate: number;
  overheadPerCentrePerMonth: number;
  corporateOverheadPerMonth: number;
  casualPercentage: number;
  operatingWeeksPerYear: number;
  operatingDaysPerWeek: number;
}

export interface ScenarioOutputs {
  annualRevenuePerCentre: number;
  annualCostPerCentre: number;
  annualProfitPerCentre: number;
  totalNetworkRevenue: number;
  totalNetworkCosts: number;
  totalNetworkProfit: number;
  marginPercent: number;
  valuationAt3x: number;
  valuationAt5x: number;
  valuationAt8x: number;
  valuationAt10x: number;
  breakEvenCentres: number;
  revenueBreakdown: { bsc: number; asc: number; vc: number };
  costBreakdown: { staff: number; centreOverhead: number; corporateOverhead: number };
}

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_INPUTS: ScenarioInputs = {
  numCentres: 15,
  bscAttendancePerDay: 25,
  ascAttendancePerDay: 35,
  vcDaysPerYear: 40,
  vcAttendancePerDay: 20,
  bscRegularPrice: 26,
  bscCasualPrice: 31,
  ascRegularPrice: 36,
  ascCasualPrice: 41,
  vcPrice: 100,
  bscEducatorsPerCentre: 2,
  ascEducatorsPerCentre: 2,
  educatorHourlyRate: 42.56,
  overheadPerCentrePerMonth: 8000,
  corporateOverheadPerMonth: 40000,
  casualPercentage: 20,
  operatingWeeksPerYear: 40,
  operatingDaysPerWeek: 5,
};

// ─── Input Metadata (for slider controls) ────────────────────────────────────

export interface InputMeta {
  key: keyof ScenarioInputs;
  label: string;
  min: number;
  max: number;
  step: number;
  format?: "currency" | "percent" | "number";
  group: "network" | "pricing" | "staffing" | "overheads";
}

export const INPUT_CONFIG: InputMeta[] = [
  // Network
  { key: "numCentres", label: "Number of Centres", min: 1, max: 100, step: 1, group: "network" },
  { key: "operatingWeeksPerYear", label: "Operating Weeks / Year", min: 30, max: 52, step: 1, group: "network" },
  { key: "operatingDaysPerWeek", label: "Operating Days / Week", min: 3, max: 7, step: 1, group: "network" },
  // Pricing
  { key: "bscRegularPrice", label: "BSC Regular Price", min: 10, max: 60, step: 0.5, format: "currency", group: "pricing" },
  { key: "bscCasualPrice", label: "BSC Casual Price", min: 10, max: 70, step: 0.5, format: "currency", group: "pricing" },
  { key: "ascRegularPrice", label: "ASC Regular Price", min: 15, max: 80, step: 0.5, format: "currency", group: "pricing" },
  { key: "ascCasualPrice", label: "ASC Casual Price", min: 15, max: 90, step: 0.5, format: "currency", group: "pricing" },
  { key: "vcPrice", label: "VC Session Price", min: 50, max: 200, step: 1, format: "currency", group: "pricing" },
  { key: "casualPercentage", label: "Casual Booking %", min: 0, max: 100, step: 1, format: "percent", group: "pricing" },
  // Staffing
  { key: "bscAttendancePerDay", label: "BSC Avg Attendance / Day", min: 0, max: 100, step: 1, group: "staffing" },
  { key: "ascAttendancePerDay", label: "ASC Avg Attendance / Day", min: 0, max: 100, step: 1, group: "staffing" },
  { key: "vcDaysPerYear", label: "VC Days / Year", min: 0, max: 60, step: 1, group: "staffing" },
  { key: "vcAttendancePerDay", label: "VC Avg Attendance / Day", min: 0, max: 100, step: 1, group: "staffing" },
  { key: "bscEducatorsPerCentre", label: "BSC Educators / Centre", min: 1, max: 10, step: 1, group: "staffing" },
  { key: "ascEducatorsPerCentre", label: "ASC Educators / Centre", min: 1, max: 10, step: 1, group: "staffing" },
  { key: "educatorHourlyRate", label: "Educator Hourly Rate", min: 25, max: 70, step: 0.5, format: "currency", group: "staffing" },
  // Overheads
  { key: "overheadPerCentrePerMonth", label: "Centre Overhead / Month", min: 0, max: 30000, step: 500, format: "currency", group: "overheads" },
  { key: "corporateOverheadPerMonth", label: "Corporate Overhead / Month", min: 0, max: 200000, step: 1000, format: "currency", group: "overheads" },
];

// ─── Preset Scenarios ────────────────────────────────────────────────────────

export const PRESET_SCENARIOS: {
  key: string;
  name: string;
  description: string;
  inputs: ScenarioInputs;
}[] = [
  {
    key: "current",
    name: "Current State",
    description: "Based on current network baseline",
    inputs: { ...DEFAULT_INPUTS },
  },
  {
    key: "conservative",
    name: "Conservative Growth",
    description: "2 centres/quarter, current pricing, moderate attendance",
    inputs: {
      ...DEFAULT_INPUTS,
      numCentres: 25,
      bscAttendancePerDay: 28,
      ascAttendancePerDay: 38,
    },
  },
  {
    key: "aggressive",
    name: "Aggressive Growth",
    description: "4 centres/quarter, optimised pricing, higher attendance",
    inputs: {
      ...DEFAULT_INPUTS,
      numCentres: 50,
      bscAttendancePerDay: 35,
      ascAttendancePerDay: 45,
      bscRegularPrice: 30,
      ascRegularPrice: 40,
      vcPrice: 110,
      vcAttendancePerDay: 25,
    },
  },
  {
    key: "exit30m",
    name: "$30M Exit",
    description: "Reverse-engineered for $30M valuation at 8x profit",
    inputs: {
      ...DEFAULT_INPUTS,
      numCentres: 45,
      bscAttendancePerDay: 35,
      ascAttendancePerDay: 45,
      bscRegularPrice: 29,
      ascRegularPrice: 39,
      vcPrice: 110,
      vcAttendancePerDay: 25,
      overheadPerCentrePerMonth: 7000,
      corporateOverheadPerMonth: 50000,
    },
  },
];

// ─── Calculation ─────────────────────────────────────────────────────────────

const BSC_SHIFT_HOURS = 2.5; // 6:30am–9:00am
const ASC_SHIFT_HOURS = 3.0; // 3:00pm–6:00pm

export function calculateScenario(inputs: ScenarioInputs): ScenarioOutputs {
  const {
    numCentres,
    bscAttendancePerDay,
    ascAttendancePerDay,
    vcDaysPerYear,
    vcAttendancePerDay,
    bscRegularPrice,
    bscCasualPrice,
    ascRegularPrice,
    ascCasualPrice,
    vcPrice,
    bscEducatorsPerCentre,
    ascEducatorsPerCentre,
    educatorHourlyRate,
    overheadPerCentrePerMonth,
    corporateOverheadPerMonth,
    casualPercentage,
    operatingWeeksPerYear,
    operatingDaysPerWeek,
  } = inputs;

  const casualFraction = casualPercentage / 100;
  const regularFraction = 1 - casualFraction;
  const annualOperatingDays = operatingWeeksPerYear * operatingDaysPerWeek;

  // Blended rates (weighted avg of regular + casual)
  const bscBlendedRate = bscRegularPrice * regularFraction + bscCasualPrice * casualFraction;
  const ascBlendedRate = ascRegularPrice * regularFraction + ascCasualPrice * casualFraction;

  // Revenue per centre per year
  const bscRevPerCentre = bscAttendancePerDay * bscBlendedRate * annualOperatingDays;
  const ascRevPerCentre = ascAttendancePerDay * ascBlendedRate * annualOperatingDays;
  const vcRevPerCentre = vcAttendancePerDay * vcPrice * vcDaysPerYear;
  const annualRevenuePerCentre = bscRevPerCentre + ascRevPerCentre + vcRevPerCentre;

  // Staff costs per centre per year
  const bscStaffCost = bscEducatorsPerCentre * BSC_SHIFT_HOURS * educatorHourlyRate * annualOperatingDays;
  const ascStaffCost = ascEducatorsPerCentre * ASC_SHIFT_HOURS * educatorHourlyRate * annualOperatingDays;
  const totalStaffCostPerCentre = bscStaffCost + ascStaffCost;

  // Overhead per centre per year
  const centreOverheadAnnual = overheadPerCentrePerMonth * 12;
  const annualCostPerCentre = totalStaffCostPerCentre + centreOverheadAnnual;

  // Network totals
  const totalNetworkRevenue = annualRevenuePerCentre * numCentres;
  const totalCentresCosts = annualCostPerCentre * numCentres;
  const corporateOverheadAnnual = corporateOverheadPerMonth * 12;
  const totalNetworkCosts = totalCentresCosts + corporateOverheadAnnual;
  const totalNetworkProfit = totalNetworkRevenue - totalNetworkCosts;

  const marginPercent =
    totalNetworkRevenue > 0 ? (totalNetworkProfit / totalNetworkRevenue) * 100 : 0;

  // Break-even: how many centres needed to cover corporate overhead
  const profitPerCentre = annualRevenuePerCentre - annualCostPerCentre;
  const breakEvenCentres =
    profitPerCentre > 0 ? Math.ceil(corporateOverheadAnnual / profitPerCentre) : 999;

  return {
    annualRevenuePerCentre,
    annualCostPerCentre,
    annualProfitPerCentre: profitPerCentre,
    totalNetworkRevenue,
    totalNetworkCosts,
    totalNetworkProfit,
    marginPercent,
    valuationAt3x: totalNetworkProfit * 3,
    valuationAt5x: totalNetworkProfit * 5,
    valuationAt8x: totalNetworkProfit * 8,
    valuationAt10x: totalNetworkProfit * 10,
    breakEvenCentres: Number.isFinite(breakEvenCentres) ? breakEvenCentres : 999,
    revenueBreakdown: {
      bsc: bscRevPerCentre * numCentres,
      asc: ascRevPerCentre * numCentres,
      vc: vcRevPerCentre * numCentres,
    },
    costBreakdown: {
      staff: totalStaffCostPerCentre * numCentres,
      centreOverhead: centreOverheadAnnual * numCentres,
      corporateOverhead: corporateOverheadAnnual,
    },
  };
}

// ─── Currency Formatter ──────────────────────────────────────────────────────

export function formatAUD(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatAUDFull(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

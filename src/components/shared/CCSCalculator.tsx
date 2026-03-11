"use client";

import { useState, useMemo } from "react";
import { Calculator, Info } from "lucide-react";

/**
 * CCS income thresholds and subsidy percentages.
 * These are approximate 2025-26 rates. Update annually when the
 * Australian Government publishes new thresholds at servicesaustralia.gov.au.
 */
const INCOME_BRACKETS = [
  { label: "Up to $80,000", max: 80000, ccsPercent: 90 },
  { label: "$80,001 – $100,000", max: 100000, ccsPercent: 85 },
  { label: "$100,001 – $120,000", max: 120000, ccsPercent: 80 },
  { label: "$120,001 – $140,000", max: 140000, ccsPercent: 75 },
  { label: "$140,001 – $160,000", max: 160000, ccsPercent: 70 },
  { label: "$160,001 – $180,000", max: 180000, ccsPercent: 65 },
  { label: "$180,001 – $200,000", max: 200000, ccsPercent: 60 },
  { label: "$200,001 – $220,000", max: 220000, ccsPercent: 55 },
  { label: "$220,001 – $240,000", max: 240000, ccsPercent: 50 },
  { label: "$240,001 – $260,000", max: 260000, ccsPercent: 45 },
  { label: "$260,001 – $280,000", max: 280000, ccsPercent: 40 },
  { label: "$280,001 – $300,000", max: 300000, ccsPercent: 35 },
  { label: "$300,001 – $350,000", max: 350000, ccsPercent: 30 },
  { label: "$350,001 – $360,000", max: 360000, ccsPercent: 20 },
  // Sliding scale: linear from 20% at $360k to 0% at $530k
  { label: "$360,001 – $380,000", max: 380000, ccsPercent: 18 },
  { label: "$380,001 – $400,000", max: 400000, ccsPercent: 15 },
  { label: "$400,001 – $420,000", max: 420000, ccsPercent: 13 },
  { label: "$420,001 – $440,000", max: 440000, ccsPercent: 11 },
  { label: "$440,001 – $460,000", max: 460000, ccsPercent: 8 },
  { label: "$460,001 – $480,000", max: 480000, ccsPercent: 6 },
  { label: "$480,001 – $500,000", max: 500000, ccsPercent: 4 },
  { label: "$500,001 – $530,000", max: 530000, ccsPercent: 2 },
  { label: "Over $530,000", max: Infinity, ccsPercent: 0 },
];

// Hourly cap rate (2025)
const HOURLY_CAP = 13.73;
// Approximate session hours for cap calculation
const BSC_HOURS = 2;
const ASC_HOURS = 4;
const WEEKS_PER_YEAR = 40;

// Default Amana rates
const DEFAULT_RATES = {
  bscRegular: 26,
  bscCasual: 31,
  ascRegular: 36,
  ascCasual: 41,
};

interface CCSCalculatorProps {
  /** Override default BSC regular rate */
  bscRegularRate?: number;
  /** Override default BSC casual rate */
  bscCasualRate?: number;
  /** Override default ASC regular rate */
  ascRegularRate?: number;
  /** Override default ASC casual rate */
  ascCasualRate?: number;
  /** Compact mode for embedding in panels */
  compact?: boolean;
}

export function CCSCalculator({
  bscRegularRate = DEFAULT_RATES.bscRegular,
  bscCasualRate = DEFAULT_RATES.bscCasual,
  ascRegularRate = DEFAULT_RATES.ascRegular,
  ascCasualRate = DEFAULT_RATES.ascCasual,
  compact = false,
}: CCSCalculatorProps) {
  const [incomeBracketIdx, setIncomeBracketIdx] = useState(0);
  const [sessionType, setSessionType] = useState<"bsc" | "asc">("bsc");
  const [bookingType, setBookingType] = useState<"regular" | "casual">("regular");
  const [daysPerWeek, setDaysPerWeek] = useState(3);

  const result = useMemo(() => {
    const bracket = INCOME_BRACKETS[incomeBracketIdx];

    const ccsPercent = bracket.ccsPercent;

    // Session fee
    const fee =
      sessionType === "bsc"
        ? bookingType === "regular"
          ? bscRegularRate
          : bscCasualRate
        : bookingType === "regular"
        ? ascRegularRate
        : ascCasualRate;

    // Cap: CCS applies to lesser of fee or (hourly cap * session hours)
    const sessionHours = sessionType === "bsc" ? BSC_HOURS : ASC_HOURS;
    const capAmount = HOURLY_CAP * sessionHours;
    const ccsAppliesTo = Math.min(fee, capAmount);

    const govPays = Math.round(ccsAppliesTo * (ccsPercent / 100) * 100) / 100;
    const youPay = Math.round((fee - govPays) * 100) / 100;
    const weeklyCost = Math.round(youPay * daysPerWeek * 100) / 100;
    const annualEstimate = Math.round(weeklyCost * WEEKS_PER_YEAR * 100) / 100;

    return {
      fee,
      ccsPercent,
      capAmount,
      govPays,
      youPay,
      weeklyCost,
      annualEstimate,
    };
  }, [incomeBracketIdx, sessionType, bookingType, daysPerWeek, bscRegularRate, bscCasualRate, ascRegularRate, ascCasualRate]);

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {/* Header */}
      {!compact && (
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[#004E64]/10">
            <Calculator className="h-6 w-6 text-[#004E64]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">CCS Calculator</h3>
            <p className="text-sm text-gray-500">
              Estimate your Child Care Subsidy and out-of-pocket costs
            </p>
          </div>
        </div>
      )}

      {/* Callout */}
      <div className="bg-[#FECE00]/20 border border-[#FECE00] rounded-xl p-4 text-center">
        <p className="text-sm text-gray-600">From as little as</p>
        <p className="text-3xl font-bold text-[#004E64]">
          ${result.youPay.toFixed(2)}
        </p>
        <p className="text-sm text-gray-600">per session</p>
      </div>

      {/* Inputs */}
      <div className={`grid ${compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"} gap-4`}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Household Income
          </label>
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={incomeBracketIdx}
            onChange={(e) => setIncomeBracketIdx(Number(e.target.value))}
          >
            {INCOME_BRACKETS.map((b, i) => (
              <option key={i} value={i}>{b.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Session Type
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setSessionType("bsc")}
              className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                sessionType === "bsc"
                  ? "bg-[#004E64] text-white border-[#004E64]"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              BSC (Before)
            </button>
            <button
              onClick={() => setSessionType("asc")}
              className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                sessionType === "asc"
                  ? "bg-[#004E64] text-white border-[#004E64]"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              ASC (After)
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Booking Type
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setBookingType("regular")}
              className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                bookingType === "regular"
                  ? "bg-[#004E64] text-white border-[#004E64]"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              Regular
            </button>
            <button
              onClick={() => setBookingType("casual")}
              className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                bookingType === "casual"
                  ? "bg-[#004E64] text-white border-[#004E64]"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              Casual
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Days per Week: {daysPerWeek}
          </label>
          <input
            type="range"
            min={1}
            max={5}
            value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(Number(e.target.value))}
            className="w-full accent-[#004E64]"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white rounded-xl border divide-y">
        <ResultRow label="Session Fee" value={`$${result.fee.toFixed(2)}`} />
        <ResultRow label="CCS Percentage" value={`${result.ccsPercent}%`} />
        <ResultRow label="Government Pays" value={`$${result.govPays.toFixed(2)}`} highlight="green" />
        <ResultRow label="You Pay per Session" value={`$${result.youPay.toFixed(2)}`} highlight="blue" />
        <ResultRow label={`Weekly Cost (${daysPerWeek} days)`} value={`$${result.weeklyCost.toFixed(2)}`} />
        <ResultRow label="Annual Estimate (40 wks)" value={`$${result.annualEstimate.toFixed(2)}`} bold />
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          This is an estimate only. Actual CCS depends on your individual
          circumstances, activity test, and current government rates. Visit{" "}
          <span className="text-blue-500">servicesaustralia.gov.au</span> for
          official calculations.
        </p>
      </div>
    </div>
  );
}

function ResultRow({
  label,
  value,
  highlight,
  bold,
}: {
  label: string;
  value: string;
  highlight?: "green" | "blue";
  bold?: boolean;
}) {
  const valueColour =
    highlight === "green"
      ? "text-green-600"
      : highlight === "blue"
      ? "text-[#004E64]"
      : "text-gray-900";

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className={`text-sm ${bold ? "font-semibold text-gray-900" : "text-gray-600"}`}>
        {label}
      </span>
      <span className={`text-sm font-semibold ${valueColour}`}>{value}</span>
    </div>
  );
}

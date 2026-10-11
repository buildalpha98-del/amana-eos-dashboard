// @vitest-environment jsdom
import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";

vi.mock("@/hooks/usePerformance", () => ({
  usePerformance: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/ui/AiButton", () => ({ AiButton: () => null }));
vi.mock("@/components/trends/TrendInsightsWidget", () => ({ TrendInsightsWidget: () => null }));
vi.mock("@/components/reports/ReportsDashboard", () => ({ ReportsDashboard: () => <p>Operational reports</p> }));
vi.mock("@/components/performance/CentreComparison", () => ({ CentreComparison: () => <p>Centre comparison</p> }));
vi.mock("@/components/performance/ForecastView", () => ({ ForecastView: () => <p>Occupancy forecast</p> }));
vi.mock("@/components/performance/CentreLeaderboard", () => ({ CentreLeaderboard: () => <p>Centre leaderboard</p> }));
vi.mock("@/components/performance/RegionalRollup", () => ({ RegionalRollup: () => null }));
vi.mock("@/components/layout/PageHeader", () => ({
  PageHeader: ({ toggles }: { toggles: { value: string; onChange: (value: string) => void; options: { label: string; value: string }[] }[] }) => (
    <div>
      <p>Selected view: {toggles[0].value}</p>
      {toggles[0].options.map(option => <button key={option.value} onClick={() => toggles[0].onChange(option.value)}>{option.label}</button>)}
    </div>
  ),
}));

import PerformancePage from "@/app/(dashboard)/performance/page";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
});

async function hydrateView(query: string) {
  window.history.replaceState(null, "", `/performance?view=${query}`);
  const browserWindow = window;
  let html: string;
  vi.stubGlobal("window", undefined);
  try {
    html = renderToString(<PerformancePage />);
  } finally {
    vi.stubGlobal("window", browserWindow);
  }
  container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  const recoverableErrors: unknown[] = [];
  await act(async () => {
    root = hydrateRoot(container!, <PerformancePage />, {
      onRecoverableError: error => recoverableErrors.push(error),
    });
  });
  return { page: within(container), recoverableErrors };
}

describe("performance deep links", () => {
  it.each([
    ["reports", "Operational reports"],
    ["compare", "Centre comparison"],
    ["forecast", "Occupancy forecast"],
    ["leaderboard", "No performance data available yet."],
  ])("hydrates the %s link without replacing mismatched server HTML", async (query, content) => {
    const { page, recoverableErrors } = await hydrateView(query);
    expect(page.getByText(`Selected view: ${query}`)).toBeVisible();
    expect(page.getByText(content)).toBeVisible();
    expect(recoverableErrors).toEqual([]);
  });

  it("defaults unknown links to centres and preserves manual view switching", async () => {
    const { page, recoverableErrors } = await hydrateView("unknown");
    expect(page.getByText("Selected view: centres")).toBeVisible();
    fireEvent.click(page.getByRole("button", { name: "Reports" }));
    expect(page.getByText("Operational reports")).toBeVisible();
    fireEvent.click(page.getByRole("button", { name: "Centres" }));
    expect(page.getByText("Selected view: centres")).toBeVisible();
    expect(recoverableErrors).toEqual([]);
  });
});

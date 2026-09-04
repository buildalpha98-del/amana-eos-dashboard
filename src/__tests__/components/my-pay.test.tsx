// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PayslipHeroCard } from "@/components/my-pay/PayslipHeroCard";
import { MyPayContent } from "@/components/my-pay/MyPayContent";
import type { PayslipSummary } from "@/hooks/useMyPayslips";

const latestSlip: PayslipSummary = {
  id: 1,
  payRunId: 7,
  payPeriodStarting: "15/08/2026",
  payPeriodEnding: "28/08/2026",
  grossEarnings: 1562.3,
  netEarnings: 1284.6,
  totalHours: 38.5,
  isPublished: true,
};

describe("PayslipHeroCard", () => {
  it("shows the net amount as the headline", () => {
    render(<PayslipHeroCard slip={latestSlip} />);
    expect(screen.getByText("$1,284.60")).toBeTruthy();
    expect(screen.getByText(/net/i)).toBeTruthy();
  });

  it("shows the gross / deductions / hours breakdown (deductions = gross − net)", () => {
    const { container } = render(<PayslipHeroCard slip={latestSlip} />);
    const text = container.textContent ?? "";
    expect(text).toContain("$1,562.30"); // gross
    expect(text).toContain("$277.70"); // deductions = 1562.30 − 1284.60
    expect(text).toContain("38.5"); // hours
  });

  it("shows the pay period", () => {
    const { container } = render(<PayslipHeroCard slip={latestSlip} />);
    expect(container.textContent).toContain("15/08/2026 – 28/08/2026");
  });

  it("links View and Download at the payslip download endpoint", () => {
    render(<PayslipHeroCard slip={latestSlip} />);
    const view = screen.getByRole("link", { name: /view payslip/i });
    const download = screen.getByRole("link", { name: /download/i });
    expect(view.getAttribute("href")).toContain(
      "/api/my-portal/payslips/7/download",
    );
    expect(download.getAttribute("href")).toContain(
      "/api/my-portal/payslips/7/download",
    );
  });

  it("marks unpublished slips as draft", () => {
    const { container } = render(
      <PayslipHeroCard slip={{ ...latestSlip, isPublished: false }} />,
    );
    expect(container.textContent).toMatch(/draft/i);
  });
});

/* ------------------------------------------------------------------ */
/* MyPayContent — page-level composition via the shared hook           */
/* ------------------------------------------------------------------ */

// MyPayContent fetches /api/my-portal/payslips via fetchApi (which checks
// content-type). Mock returns { payslips: PayslipSummary[] } or an error
// status (404 = not linked, 503 = not configured).
function mockFetchPayslips(
  payslips: PayslipSummary[],
  opts: { status?: number } = {},
) {
  const status = opts.status ?? 200;
  const ok = status < 400;
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/my-portal/payslips")) {
      return Promise.resolve({
        ok,
        status,
        headers: {
          get: (h: string) => (h === "content-type" ? "application/json" : null),
        },
        json: async () => (ok ? { payslips } : { error: "nope" }),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({}),
    });
  }) as unknown as typeof fetch;
}

function renderContent() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MyPayContent />
    </QueryClientProvider>,
  );
}

const earlierSlip: PayslipSummary = {
  id: 2,
  payRunId: 6,
  payPeriodStarting: "01/08/2026",
  payPeriodEnding: "14/08/2026",
  grossEarnings: 1663.7,
  netEarnings: 1357.9,
  totalHours: 41,
  isPublished: true,
};

describe("MyPayContent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders hero for the latest slip, totals strip, and earlier payslips", async () => {
    mockFetchPayslips([latestSlip, earlierSlip]);
    const { container } = renderContent();

    // Hero = latest slip's net
    expect(await screen.findByText("$1,284.60")).toBeTruthy();

    const text = container.textContent ?? "";
    // Totals strip sums the shown slips, honestly labelled
    expect(text).toContain("$3,226.00"); // gross 1562.30 + 1663.70
    expect(text).toContain("$2,642.50"); // net 1284.60 + 1357.90
    expect(text).toMatch(/across the 2 payslips shown/i);
    // Earlier slip in the history list
    expect(text).toContain("01/08/2026 – 14/08/2026");
    expect(text).toContain("Earlier payslips");
  });

  it("shows the not-linked copy on 404", async () => {
    mockFetchPayslips([], { status: 404 });
    const { container } = renderContent();
    await waitFor(() => {
      expect(container.textContent).toMatch(
        /isn't linked to a payroll record/i,
      );
    });
  });

  it("shows the not-configured copy on 503", async () => {
    mockFetchPayslips([], { status: 503 });
    const { container } = renderContent();
    await waitFor(() => {
      expect(container.textContent).toMatch(
        /Payroll integration isn't set up yet/i,
      );
    });
  });

  it("shows the empty state when there are no payslips", async () => {
    mockFetchPayslips([]);
    const { container } = renderContent();
    await waitFor(() => {
      expect(container.textContent).toMatch(/No payslips yet/i);
    });
  });
});

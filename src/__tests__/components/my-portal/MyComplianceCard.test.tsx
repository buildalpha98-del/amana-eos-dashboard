// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { MyComplianceCard } from "@/components/my-portal/MyComplianceCard";

function daysFromNow(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

function mockFetchCerts(
  certs: Array<Record<string, unknown>>,
  opts: { ok?: boolean } = {},
) {
  const ok = opts.ok !== false;
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/compliance")) {
      return Promise.resolve({
        ok,
        status: ok ? 200 : 500,
        headers: {
          get: (h: string) => (h === "content-type" ? "application/json" : null),
        },
        json: async () => (ok ? certs : { error: "Server error" }),
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

function renderCard(userId = "user-1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MyComplianceCard userId={userId} />
    </QueryClientProvider>,
  );
}

describe("MyComplianceCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the card heading", async () => {
    mockFetchCerts([]);
    renderCard();
    expect(await screen.findByText(/My Compliance/i)).toBeTruthy();
  });

  it("shows the empty state when there are no certs", async () => {
    mockFetchCerts([]);
    const { container } = renderCard();
    await waitFor(() => {
      expect(container.textContent).toMatch(/No certificates on file/i);
    });
  });

  it("renders a cert row with label, status, and download link", async () => {
    mockFetchCerts([
      {
        id: "cert-1",
        userId: "user-1",
        type: "wwcc",
        label: null,
        issueDate: daysFromNow(-365),
        expiryDate: daysFromNow(60),
        fileUrl: "https://example.com/file.pdf",
        fileName: "wwcc.pdf",
      },
    ]);
    const { container } = renderCard("user-1");

    const row = await screen.findByTestId("my-cert-cert-1");
    expect(row.textContent).toContain("WWCC");

    const link = await screen.findByTestId("my-cert-download-cert-1");
    expect(link.getAttribute("href")).toBe("/api/compliance/cert-1/download");

    // Status badge — valid (60 days out) should render "Valid"
    expect(container.textContent).toMatch(/Valid/);
  });

  it("shows 'No file' when a cert has no attached fileUrl", async () => {
    mockFetchCerts([
      {
        id: "cert-2",
        userId: "user-1",
        type: "first_aid",
        label: "First Aid & CPR",
        issueDate: daysFromNow(-100),
        expiryDate: daysFromNow(200),
        fileUrl: null,
        fileName: null,
      },
    ]);
    renderCard("user-1");

    const row = await screen.findByTestId("my-cert-cert-2");
    expect(row.textContent).toContain("First Aid & CPR");
    expect(row.textContent).toMatch(/No file/);
    expect(screen.queryByTestId("my-cert-download-cert-2")).toBeNull();
  });

  it("filters out certs for other users defensively", async () => {
    mockFetchCerts([
      {
        id: "mine",
        userId: "user-1",
        type: "wwcc",
        label: null,
        issueDate: daysFromNow(-365),
        expiryDate: daysFromNow(60),
        fileUrl: "https://example.com/mine.pdf",
        fileName: "mine.pdf",
      },
      {
        id: "someone-else",
        userId: "user-2",
        type: "wwcc",
        label: null,
        issueDate: daysFromNow(-365),
        expiryDate: daysFromNow(60),
        fileUrl: "https://example.com/other.pdf",
        fileName: "other.pdf",
      },
    ]);
    renderCard("user-1");

    await screen.findByTestId("my-cert-mine");
    expect(screen.queryByTestId("my-cert-someone-else")).toBeNull();
  });
});

/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(),
}));
import { fetchApi } from "@/lib/fetch-api";
const mockedFetch = vi.mocked(fetchApi);

import EnrolmentThankYouPage from "@/app/parent/enrol/thank-you/page";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EnrolmentThankYouPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockedFetch.mockReset();
  mockSearchParams = new URLSearchParams();
});

describe("EnrolmentThankYouPage", () => {
  it("thanks the parent and shows a reference derived from the submissionId", async () => {
    mockSearchParams = new URLSearchParams({ submissionId: "abc12345-def6-7890" });
    renderPage();
    expect(await screen.findByText("Thank you!")).toBeInTheDocument();
    expect(screen.getByText(/ABC12345/)).toBeInTheDocument();
  });

  it("shows the generic message when there's no serviceId (unmatched school)", async () => {
    mockSearchParams = new URLSearchParams({ submissionId: "sub-1" });
    renderPage();
    expect(
      await screen.findByText(/be in touch within one business day/i),
    ).toBeInTheDocument();
    // No serviceId means the centres query never fires.
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("shows the centre's custom thank-you message when one is set", async () => {
    mockSearchParams = new URLSearchParams({ submissionId: "sub-1", serviceId: "svc-1" });
    mockedFetch.mockResolvedValue({
      centres: [
        {
          id: "svc-1",
          name: "Mawson Lakes",
          content: { enrolmentThankYou: "We'll call to confirm your start date." },
        },
      ],
    });
    renderPage();
    expect(
      await screen.findByText("We'll call to confirm your start date."),
    ).toBeInTheDocument();
  });

  it("falls back to the generic message when the matched centre hasn't customised it", async () => {
    mockSearchParams = new URLSearchParams({ submissionId: "sub-1", serviceId: "svc-1" });
    mockedFetch.mockResolvedValue({
      centres: [{ id: "svc-1", name: "Mawson Lakes", content: { enrolmentThankYou: "" } }],
    });
    renderPage();
    expect(
      await screen.findByText(/be in touch within one business day/i),
    ).toBeInTheDocument();
  });

  it("falls back to the generic message when the serviceId doesn't match any returned centre", async () => {
    mockSearchParams = new URLSearchParams({ submissionId: "sub-1", serviceId: "svc-missing" });
    mockedFetch.mockResolvedValue({
      centres: [{ id: "svc-1", name: "Mawson Lakes", content: { enrolmentThankYou: "Hi" } }],
    });
    renderPage();
    expect(
      await screen.findByText(/be in touch within one business day/i),
    ).toBeInTheDocument();
  });
});

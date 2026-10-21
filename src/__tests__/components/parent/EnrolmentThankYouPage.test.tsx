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
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/parent/enrol/thank-you");
});

describe("EnrolmentThankYouPage", () => {
  // Security brief batch 5 (2026-10-21): the Meta Pixel reports the page URL,
  // so the ids leave the address bar before it loads — and a refresh still
  // shows the right page.
  it("scrubs the ids from the address bar but keeps the page working after a refresh", async () => {
    window.history.replaceState(null, "", "/parent/enrol/thank-you?submissionId=abc12345-x&serviceId=svc-1");
    mockSearchParams = new URLSearchParams({ submissionId: "abc12345-x", serviceId: "svc-1" });
    const first = renderPage();
    expect(await screen.findByText(/ABC12345/)).toBeInTheDocument();
    expect(window.location.search).toBe("");
    first.unmount();

    mockSearchParams = new URLSearchParams(); // refreshed: the URL has no ids now
    renderPage();
    expect(await screen.findByText(/ABC12345/)).toBeInTheDocument();
  });

  it("thanks the parent and shows a reference derived from the submissionId", async () => {
    mockSearchParams = new URLSearchParams({ submissionId: "abc12345-def6-7890" });
    renderPage();
    expect(await screen.findByText("Thank you so much for your enrolment")).toBeInTheDocument();
    expect(screen.getByText(/ABC12345/)).toBeInTheDocument();
  });

  it("shows the generic message when there's no serviceId (unmatched school)", async () => {
    mockSearchParams = new URLSearchParams({ submissionId: "sub-1" });
    renderPage();
    expect(
      await screen.findByText(/get back to you within 24 hours to confirm everything/i),
    ).toBeInTheDocument();
    // No serviceId means the centres query never fires (the family's
    // enrolment state is still read, to word the page).
    expect(mockedFetch).not.toHaveBeenCalledWith("/api/parent/centres");
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
      await screen.findByText(/get back to you within 24 hours to confirm everything/i),
    ).toBeInTheDocument();
  });

  it("falls back to the generic message when the serviceId doesn't match any returned centre", async () => {
    mockSearchParams = new URLSearchParams({ submissionId: "sub-1", serviceId: "svc-missing" });
    mockedFetch.mockResolvedValue({
      centres: [{ id: "svc-1", name: "Mawson Lakes", content: { enrolmentThankYou: "Hi" } }],
    });
    renderPage();
    expect(
      await screen.findByText(/get back to you within 24 hours to confirm everything/i),
    ).toBeInTheDocument();
  });

  // 2026-09-08: Daniel asked for "extensive info" once a family lands
  // here — approval number, operating hours, contact, and the map —
  // all specific to the centre they just enrolled at.
  describe("centre details", () => {
    const fullCentre = {
      id: "svc-1",
      name: "Mawson Lakes",
      address: "12 School Rd, Mawson Lakes SA 5095",
      phone: "08 8123 4567",
      email: "mawsonlakes@amanaoshc.com.au",
      serviceApprovalNumber: "SE-00012345",
      operatingDays: "Mon-Fri",
      rooms: [
        { id: "r1", name: "Before School Care", startTime: "06:30", endTime: "08:45" },
        { id: "r2", name: "After School Care", startTime: "15:00", endTime: "18:00" },
      ],
      content: {
        enrolmentThankYou: "",
        locationWithinSchool: "Hall, next to the canteen",
        serviceMapUrl: "https://blob.example/mawson-map.png",
        serviceMapName: "Mawson Lakes map",
      },
    };

    it("shows the centre's contact details, approval number, and operating hours", async () => {
      mockSearchParams = new URLSearchParams({ submissionId: "sub-1", serviceId: "svc-1" });
      mockedFetch.mockResolvedValue({ centres: [fullCentre] });
      renderPage();

      expect(await screen.findByText(/12 School Rd/)).toBeInTheDocument();
      expect(screen.getByText("Hall, next to the canteen")).toBeInTheDocument();
      expect(screen.getByText("08 8123 4567")).toBeInTheDocument();
      expect(screen.getByText("mawsonlakes@amanaoshc.com.au")).toBeInTheDocument();
      expect(screen.getByText(/SE-00012345/)).toBeInTheDocument();
      expect(screen.getByText("Before School Care")).toBeInTheDocument();
      expect(screen.getByText("6:30am – 8:45am")).toBeInTheDocument();
      expect(screen.getByText("After School Care")).toBeInTheDocument();
      expect(screen.getByText("3:00pm – 6:00pm")).toBeInTheDocument();
      expect(screen.getByText(/Mon-Fri/)).toBeInTheDocument();
    });

    it("links to the map image", async () => {
      mockSearchParams = new URLSearchParams({ submissionId: "sub-1", serviceId: "svc-1" });
      mockedFetch.mockResolvedValue({ centres: [fullCentre] });
      renderPage();
      const mapLink = await screen.findByRole("link", {
        name: /map showing where mawson lakes is located/i,
      });
      expect(mapLink).toHaveAttribute("href", "https://blob.example/mawson-map.png");
    });

    it("does not crash and shows no centre section when rooms/address/etc are absent", async () => {
      mockSearchParams = new URLSearchParams({ submissionId: "sub-1", serviceId: "svc-1" });
      mockedFetch.mockResolvedValue({
        centres: [{ id: "svc-1", name: "Mawson Lakes", content: { enrolmentThankYou: "" } }],
      });
      renderPage();
      expect(await screen.findByText("Thank you so much for your enrolment")).toBeInTheDocument();
      expect(screen.queryByText(/Operating hours/)).toBeNull();
    });

    it("omits the operating hours section when no room has both times set", async () => {
      mockSearchParams = new URLSearchParams({ submissionId: "sub-1", serviceId: "svc-1" });
      mockedFetch.mockResolvedValue({
        centres: [{ ...fullCentre, rooms: [] }],
      });
      renderPage();
      expect(await screen.findByText(/12 School Rd/)).toBeInTheDocument();
      expect(screen.queryByText(/Operating hours/)).toBeNull();
    });
  });

  it("keeps families out of the app: no portal or Messages links while it's closed", async () => {
    mockSearchParams = new URLSearchParams({ submissionId: "sub-1" });
    renderPage();
    await screen.findByText("Thank you so much for your enrolment");
    expect(screen.queryByText("Go to my portal")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Messages" })).not.toBeInTheDocument();
  });

  it("tells a family the team has already confirmed that the app is coming", async () => {
    mockSearchParams = new URLSearchParams({ submissionId: "sub-1" });
    mockedFetch.mockImplementation(async (url: string) =>
      url === "/api/parent/state" ? { state: "active" } : { centres: [] },
    );
    renderPage();
    expect(await screen.findByText("Your enrolment is confirmed")).toBeInTheDocument();
  });
});

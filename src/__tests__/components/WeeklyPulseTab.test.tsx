// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WeeklyPulseTab } from "@/components/communication/WeeklyPulseTab";

// Mock next-auth session — return a logged-in user
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: { id: "user-1", email: "test@example.com", role: "member" },
    },
    status: "authenticated",
  }),
}));

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function installEmptyPulseFetchMock() {
  // Return a *new* empty array object on every call so any code that relies
  // on object identity (the old bug) would fire its load effect on every refetch.
  global.fetch = vi.fn().mockImplementation(async (url: string | URL) => {
    const u = String(url);
    if (u.includes("/pulse/summary")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          totalUsers: 0,
          submitted: 0,
          avgMood: 0,
          blockerCount: 0,
          pulses: [],
        }),
      };
    }
    if (u.includes("/pulse")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}),
    };
  }) as unknown as typeof fetch;
}

describe("WeeklyPulseTab — input state retention across refetches", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves typed wins content when the pulses query refetches with a new reference", async () => {
    installEmptyPulseFetchMock();

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(<WeeklyPulseTab />, { wrapper: makeWrapper(qc) });

    // Wait for initial render + first query resolution
    const textarea = (await waitFor(() =>
      screen.getByPlaceholderText(/share your wins/i),
    )) as HTMLTextAreaElement;

    // Simulate user typing a full 50-character string (single change event,
    // same net effect as many keystrokes for state purposes).
    const typed = "This is a 50 char wins entry for bug-7 regression!";
    fireEvent.change(textarea, { target: { value: typed } });

    // Confirm the state accepted the input
    expect(
      (screen.getByPlaceholderText(/share your wins/i) as HTMLTextAreaElement)
        .value,
    ).toBe(typed);

    // Now simulate the real-world trigger of Bug #7: a background refetch
    // that returns a new `myPulses` object reference. Before the fix, the
    // load effect depended on that reference and would reset `wins` to "".
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["pulses"] });
    });

    // Re-query in case the inline MyPulseView remounted
    const afterRefetch = screen.getByPlaceholderText(
      /share your wins/i,
    ) as HTMLTextAreaElement;

    // After the fix, the wins state must survive the refetch.
    expect(afterRefetch.value).toBe(typed);
  });
});

// @vitest-environment jsdom
/**
 * My Expenses must not flash the "Snap your receipt" screen while it finds
 * out whether claims are possible (2026-10-09, Daniel's report).
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/fetch-api", () => ({ fetchApi: fetchMock, mutateApi: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "u", role: "staff" } } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

import { MyExpensesContent } from "@/components/my-expenses/MyExpensesContent";

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

describe("My Expenses loading", () => {
  it("shows a neutral placeholder, not the claim form, while loading", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    wrap(<MyExpensesContent />);
    expect(screen.getByTestId("my-expenses-loading")).toBeDefined();
    expect(screen.queryByTestId("expense-snap-hero")).toBeNull();
  });

  it("goes straight to 'not available' for an unlinked account", async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error("Not linked"), { status: 404 }));
    wrap(<MyExpensesContent />);
    expect(await screen.findByTestId("my-expenses-unavailable")).toBeDefined();
    expect(screen.queryByTestId("expense-snap-hero")).toBeNull();
  });
});

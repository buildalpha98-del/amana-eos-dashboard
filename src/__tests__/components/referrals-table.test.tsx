// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ReferralsTable } from "@/components/recruitment/ReferralsTable";
import type { Referral } from "@/hooks/useRecruitment";

const mockUseReferrals = vi.fn();
vi.mock("@/hooks/useRecruitment", async (orig) => {
  const actual = await (orig as unknown as () => Promise<Record<string, unknown>>)();
  return {
    ...actual,
    useReferrals: (...args: unknown[]) => mockUseReferrals(...args),
    useMarkReferralPaid: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(async () => ({})),
      isPending: false,
    }),
  };
});

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const pendingReferral: Referral = {
  id: "r-1",
  referrerUserId: "u-1",
  referrerUser: { id: "u-1", name: "Amira Referrer", email: "amira@t.com", avatar: null },
  referredName: "Friend One",
  referredEmail: null,
  candidateId: null,
  candidate: null,
  status: "pending",
  bonusAmount: 200,
  bonusPaidAt: null,
  lastReminderAt: null,
  createdAt: "2026-04-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
};

const paidReferral: Referral = {
  ...pendingReferral,
  id: "r-2",
  referredName: "Friend Two",
  status: "bonus_paid",
  bonusPaidAt: "2026-04-10T00:00:00Z",
};

describe("ReferralsTable", () => {
  it("shows loading state", () => {
    mockUseReferrals.mockReturnValue({ data: undefined, isLoading: true, error: null });
    render(wrap(<ReferralsTable />));
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows error state with message", () => {
    mockUseReferrals.mockReturnValue({ data: undefined, isLoading: false, error: new Error("boom") });
    render(wrap(<ReferralsTable />));
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("shows empty state when list is empty", () => {
    mockUseReferrals.mockReturnValue({ data: [], isLoading: false, error: null });
    render(wrap(<ReferralsTable />));
    expect(screen.getByText(/no staff referrals yet/i)).toBeInTheDocument();
  });

  it("renders a pending referral with Mark bonus paid CTA", () => {
    mockUseReferrals.mockReturnValue({ data: [pendingReferral], isLoading: false, error: null });
    render(wrap(<ReferralsTable />));
    expect(screen.getByText("Amira Referrer")).toBeInTheDocument();
    expect(screen.getByText("Friend One")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark bonus paid/i })).toBeInTheDocument();
  });

  it("does NOT show Mark bonus paid CTA for already-paid referral", () => {
    mockUseReferrals.mockReturnValue({ data: [paidReferral], isLoading: false, error: null });
    render(wrap(<ReferralsTable />));
    expect(screen.getByText("Bonus Paid")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark bonus paid/i })).not.toBeInTheDocument();
  });

  it("opens the mark-paid modal when the CTA is clicked", () => {
    mockUseReferrals.mockReturnValue({ data: [pendingReferral], isLoading: false, error: null });
    render(wrap(<ReferralsTable />));
    fireEvent.click(screen.getByRole("button", { name: /mark bonus paid/i }));
    // Modal opens — payout date label is unique to the modal so assert on that.
    expect(screen.getByLabelText(/payout date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bonus amount/i)).toBeInTheDocument();
  });
});

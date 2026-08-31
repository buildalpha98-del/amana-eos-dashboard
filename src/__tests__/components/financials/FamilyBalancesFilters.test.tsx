// @vitest-environment jsdom
/**
 * Filtering the family balance contact log.
 *
 * The list is one row per chase attempt across every centre, ordered by
 * date. With more than a handful of rows the question a coordinator
 * actually has — "what does Riverwood owe" or "who has Mirna already
 * rung" — couldn't be asked at all.
 *
 * The properties worth holding are the ones where a wrong answer costs
 * something: the totals must describe what's on screen, the family
 * thread must NOT be filtered, and an empty result has to offer the
 * right way out.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const contactsRef: { value: unknown[] } = { value: [] };

vi.mock("@/hooks/useFamilyBalanceContacts", () => ({
  useFamilyBalanceContacts: () => ({
    data: { contacts: contactsRef.value },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useDeleteFamilyBalanceContact: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/components/financials/NewFamilyBalanceContactModal", () => ({
  NewFamilyBalanceContactModal: () => <div data-testid="fb-modal" />,
}));

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

import FamilyBalancesPage from "@/app/(dashboard)/financials/family-balances/page";

const contact = (over: Record<string, unknown> = {}) => ({
  id: "fbc-1",
  accountName: "Khan Family",
  parentName: "Sara Khan",
  mobileNumber: "0400000000",
  parentEmail: "sara@example.com",
  amountOwing: 120,
  contactedAt: "2026-08-01T00:00:00.000Z",
  contactMethod: "phone",
  outcome: "answered",
  outcomeNotes: null,
  followUpDate: null,
  followUpTodo: null,
  serviceId: "svc-riverwood",
  service: { id: "svc-riverwood", name: "Riverwood", code: "RIV" },
  createdBy: { id: "u-mirna", name: "Mirna" },
  ...over,
});

const OTHER = contact({
  id: "fbc-2",
  accountName: "Nguyen Family",
  parentName: "Binh Nguyen",
  parentEmail: "binh@example.com",
  mobileNumber: "0411111111",
  amountOwing: 300,
  outcome: "no_answer",
  serviceId: "svc-bankstown",
  service: { id: "svc-bankstown", name: "Bankstown", code: "BNK" },
  createdBy: { id: "u-tracie", name: "Tracie" },
});

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } },
  });
  return render(<FamilyBalancesPage />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  contactsRef.value = [contact(), OTHER];
});

describe("Family balances — filtering", () => {
  it("shows every contact before anything is filtered", () => {
    renderPage();
    expect(screen.getByText("Khan Family")).toBeDefined();
    expect(screen.getByText("Nguyen Family")).toBeDefined();
  });

  it("narrows to one school", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/school/i), {
      target: { value: "svc-bankstown" },
    });

    expect(screen.queryByText("Khan Family")).toBeNull();
    expect(screen.getByText("Nguyen Family")).toBeDefined();
  });

  it("lists each school once, however many contacts it has", () => {
    // Deriving the options from the rows means a centre with four
    // chases logged doesn't appear four times in the dropdown.
    contactsRef.value = [contact(), contact({ id: "fbc-3" }), OTHER];
    renderPage();

    const options = Array.from(
      screen.getByLabelText(/school/i).querySelectorAll("option"),
    ).map((o) => o.textContent);
    expect(options).toEqual(["Every school", "Bankstown", "Riverwood"]);
  });

  it("narrows to who did the contacting", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/who contacted them/i), {
      target: { value: "u-mirna" },
    });

    expect(screen.getByText("Khan Family")).toBeDefined();
    expect(screen.queryByText("Nguyen Family")).toBeNull();
  });

  it("narrows by outcome", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/outcome/i), {
      target: { value: "no_answer" },
    });

    expect(screen.queryByText("Khan Family")).toBeNull();
    expect(screen.getByText("Nguyen Family")).toBeDefined();
  });

  it("searches across the account, parent, email and phone", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/search families/i), {
      target: { value: "binh@" },
    });

    expect(screen.getByText("Nguyen Family")).toBeDefined();
    expect(screen.queryByText("Khan Family")).toBeNull();
  });

  it("combines filters rather than replacing one with the next", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/school/i), {
      target: { value: "svc-riverwood" },
    });
    fireEvent.change(screen.getByLabelText(/who contacted them/i), {
      target: { value: "u-tracie" },
    });

    // Riverwood AND Tracie matches nothing — Tracie only rang Bankstown.
    expect(screen.queryByText("Khan Family")).toBeNull();
    expect(screen.queryByText("Nguyen Family")).toBeNull();
  });
});

describe("Family balances — honest totals", () => {
  it("totals what's on screen, not what's in the database", () => {
    // A whole-company figure sitting above a one-centre table is the
    // kind of number someone reads out in a meeting.
    renderPage();
    const total = () => screen.getByTestId("fb-total-owing").textContent;
    expect(total()).toBe("$420.00");

    fireEvent.change(screen.getByLabelText(/school/i), {
      target: { value: "svc-bankstown" },
    });
    expect(total()).toBe("$300.00");
  });

  it("says how many of the total are showing", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/school/i), {
      target: { value: "svc-bankstown" },
    });
    expect(screen.getByText(/1 of 2 contacts/i)).toBeDefined();
  });

  it("keeps the count out of the way when nothing is filtered", () => {
    renderPage();
    expect(screen.queryByText(/of 2 contacts/i)).toBeNull();
  });
});

describe("Family balances — empty states", () => {
  it("offers a way back when the filters match nothing", () => {
    // Not "log a contact" — that sends someone off to create a
    // duplicate record for a family they already chased.
    renderPage();
    fireEvent.change(screen.getByLabelText(/search families/i), {
      target: { value: "nobody" },
    });

    expect(screen.getByText(/no contacts match those filters/i)).toBeDefined();
    expect(screen.queryByText(/no contacts logged yet/i)).toBeNull();
  });

  it("clears every filter at once", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/school/i), {
      target: { value: "svc-bankstown" },
    });
    fireEvent.change(screen.getByLabelText(/search families/i), {
      target: { value: "nobody" },
    });

    // Two of these exist once nothing matches — the one in the filter
    // bar and the one in the empty state. Either must work.
    fireEvent.click(
      screen.getAllByRole("button", { name: /clear filters/i })[0],
    );

    expect(screen.getByText("Khan Family")).toBeDefined();
    expect(screen.getByText("Nguyen Family")).toBeDefined();
  });

  it("still says 'nothing logged yet' when the log really is empty", () => {
    contactsRef.value = [];
    renderPage();
    expect(screen.getByText(/no contacts logged yet/i)).toBeDefined();
  });

  it("hides the filter bar entirely when there's nothing to filter", () => {
    contactsRef.value = [];
    renderPage();
    expect(screen.queryByLabelText(/search families/i)).toBeNull();
  });
});

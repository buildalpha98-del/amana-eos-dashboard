// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * The Next button on /parent/enrol must never be a dead end.
 *
 * It used to be `disabled={!canAdvance}`, with the reason rendered at the
 * BOTTOM of the step. The nav is sticky on mobile, so Next stayed pinned in
 * the viewport while the explanation sat below the fold — on a 390x844
 * screen, Next at y=783 and "Please enter your CRN" at y=1575. Parents
 * tapped a greyed-out button, got no feedback at all, and told us the Next
 * button was broken. It was, in every way that matters to them.
 *
 * So: the button stays enabled, and a tap on an unfinished step scrolls the
 * reason into view instead of doing nothing.
 */

const scrollIntoView = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/useToast", () => ({ toast: vi.fn() }));

/** An empty draft — step 0 is unfinished, which is where parents got stuck. */
const draft = {
  initialData: {},
  initialStep: 0,
  isLoading: false,
  save: vi.fn(),
  flush: vi.fn(),
  saveState: "saved" as const,
};

vi.mock("@/hooks/useEnrolmentDraft", () => ({
  useEnrolmentDraft: () => draft,
}));

// The step bodies are long forms of their own; this is about the nav.
vi.mock("@/app/parent/enrol/MeStep", () => ({
  MeStep: () => <div data-testid="me-step" />,
}));
vi.mock("@/app/parent/enrol/ChildStep", () => ({
  ChildStep: () => <div data-testid="child-step" />,
}));
vi.mock("@/app/parent/enrol/ContactsStep", () => ({
  ContactsStep: () => <div data-testid="contacts-step" />,
}));
vi.mock("@/app/parent/enrol/AgreementStep", () => ({
  AgreementStep: () => <div data-testid="agreement-step" />,
}));
vi.mock("@/app/parent/enrol/BillingStep", () => ({
  BillingStep: () => <div data-testid="billing-step" />,
  EMPTY_PAYMENT: {},
  paymentEntered: () => false,
}));

import ParentEnrolPage from "@/app/parent/enrol/page";

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<ParentEnrolPage />, { wrapper: Wrapper });
}

describe("/parent/enrol — Next always responds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    window.scrollTo = vi.fn();
  });

  it("does NOT disable Next on an unfinished step", () => {
    renderPage();
    const next = screen.getByRole("button", { name: /next/i });

    // The regression: `disabled` here is the whole bug.
    expect(next).not.toBeDisabled();
  });

  it("scrolls the reason into view when Next is tapped", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(scrollIntoView).toHaveBeenCalled();
    // Centred, not "start" — the fields the message refers to are above it.
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "center" }),
    );
  });

  it("says what is actually missing", () => {
    renderPage();
    // An empty draft's first gap is the CRN, and the copy names it.
    expect(screen.getByRole("alert")).toHaveTextContent(/CRN/i);
  });

  it("announces the reason to screen readers", () => {
    renderPage();
    const alert = screen.getByRole("alert");

    // assertive, because it is the direct answer to a tap just made.
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(screen.getByRole("button", { name: /next/i })).toHaveAttribute(
      "aria-describedby",
      alert.id,
    );
  });

  it("does not move the parent off the step it could not complete", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Still on "About you" — explaining is not the same as advancing.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "About you",
    );
    expect(screen.getByTestId("me-step")).toBeInTheDocument();
  });
});

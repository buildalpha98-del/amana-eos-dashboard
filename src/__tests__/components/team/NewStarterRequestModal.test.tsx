// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mutateApi = vi.hoisted(() =>
  vi.fn((_url: string, _opts: { method: string; body: Record<string, unknown> }) =>
    Promise.resolve({ id: "req-new" }),
  ),
);
vi.mock("@/lib/fetch-api", () => ({ mutateApi }));
vi.mock("@/hooks/useToast", () => ({ toast: vi.fn() }));

import { NewStarterRequestModal } from "@/components/team/NewStarterRequestModal";

const SERVICES = [{ id: "svc-1", name: "Mawson Lakes" }];

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NewStarterRequestModal open onClose={vi.fn()} services={SERVICES} />
    </QueryClientProvider>,
  );
}

function fill(placeholder: string, value: string) {
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));
}

// Fills every field the modal marks mandatory EXCEPT the one under test,
// so each test isolates a single required-field failure.
function fillAllExcept(skip: string[]) {
  const set: Record<string, () => void> = {
    fullName: () => fill("Full name", "Amina Yusuf"),
    dateOfBirth: () =>
      fireEvent.change(document.querySelectorAll('input[type="date"]')[0], { target: { value: "2000-01-15" } }),
    expectedStartDate: () =>
      fireEvent.change(document.querySelectorAll('input[type="date"]')[1], { target: { value: "2026-10-01" } }),
    mobile: () => fill("04XX XXX XXX", "0400 000 000"),
    email: () => fill("Their personal or preferred email — their invite goes here", "amina@example.com"),
    targetPosition: () => fill("e.g. Educator, Service Coordinator", "Educator"),
    awardLevel: () =>
      fireEvent.change(screen.getByDisplayValue("Select award level…"), { target: { value: "cs1" } }),
    address: () => fill("Street address, suburb, state, postcode", "1 Example St"),
  };
  for (const [key, apply] of Object.entries(set)) {
    if (!skip.includes(key)) apply();
  }
}

describe("NewStarterRequestModal — mandatory fields", () => {
  beforeEach(() => vi.clearAllMocks());

  // The native `required` attribute makes the browser block the submit
  // event before our own handler runs at all (jsdom enforces this too),
  // so the observable guarantee here is "nothing gets submitted" — not
  // which toast fires first.
  it("blocks submission with no fields filled", () => {
    renderModal();
    submit();
    expect(mutateApi).not.toHaveBeenCalled();
  });

  it("does not pre-select an award level — it must be explicitly chosen", () => {
    renderModal();
    expect(screen.getByDisplayValue("Select award level…")).toBeInTheDocument();
  });

  it("marks full name, DOB, start date, mobile, email, position, and award level as required", () => {
    renderModal();
    expect(screen.getByPlaceholderText("Full name")).toBeRequired();
    expect(document.querySelectorAll('input[type="date"]')[0]).toBeRequired();
    expect(document.querySelectorAll('input[type="date"]')[1]).toBeRequired();
    expect(screen.getByPlaceholderText("04XX XXX XXX")).toBeRequired();
    expect(
      screen.getByPlaceholderText("Their personal or preferred email — their invite goes here"),
    ).toBeRequired();
    expect(screen.getByPlaceholderText("e.g. Educator, Service Coordinator")).toBeRequired();
    expect(screen.getByDisplayValue("Select award level…").closest("select")).toBeRequired();
  });

  it("blocks submission when award level is left unselected", () => {
    renderModal();
    fillAllExcept(["awardLevel"]);
    submit();
    expect(mutateApi).not.toHaveBeenCalled();
  });

  it("blocks submission when expected start date is missing", () => {
    renderModal();
    fillAllExcept(["expectedStartDate"]);
    submit();
    expect(mutateApi).not.toHaveBeenCalled();
  });

  it("blocks submission when mobile is missing", () => {
    renderModal();
    fillAllExcept(["mobile"]);
    submit();
    expect(mutateApi).not.toHaveBeenCalled();
  });

  it("blocks submission when email is missing", () => {
    renderModal();
    fillAllExcept(["email"]);
    submit();
    expect(mutateApi).not.toHaveBeenCalled();
  });

  it("blocks submission when position is missing", () => {
    renderModal();
    fillAllExcept(["targetPosition"]);
    submit();
    expect(mutateApi).not.toHaveBeenCalled();
  });

  it("submits once every mandatory field is filled", async () => {
    renderModal();
    fillAllExcept([]);
    submit();
    await waitFor(() => expect(mutateApi).toHaveBeenCalledTimes(1));
    const [, opts] = mutateApi.mock.calls[0];
    expect(opts.body).toMatchObject({
      fullName: "Amina Yusuf",
      dateOfBirth: "2000-01-15",
      expectedStartDate: "2026-10-01",
      mobile: "0400 000 000",
      email: "amina@example.com",
      targetPosition: "Educator",
      awardLevel: "cs1",
    });
  });
});

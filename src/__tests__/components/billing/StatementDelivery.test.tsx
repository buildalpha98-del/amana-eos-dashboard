// @vitest-environment jsdom
import React, { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatementDetailPanel } from "@/components/billing/StatementDetailPanel";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import type { StatementDetail } from "@/hooks/useBilling";

const state = vi.hoisted(() => ({ role: "owner" }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { role: state.role } } }) }));
vi.mock("@/lib/fetch-api", () => ({ fetchApi: vi.fn(), mutateApi: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ toast: vi.fn() }));

const base: StatementDetail = {
  id: "synthetic", serviceId: "centre", contactId: "contact", status: "issued", totalFees: 30, totalCcs: 10, gapFee: 20, amountPaid: 0, balance: 20,
  periodStart: "2026-10-05", periodEnd: "2026-10-09", createdAt: "2026-10-10", issuedAt: "2026-10-10", dueDate: null, pdfUrl: null, notes: null,
  contact: { id: "contact", firstName: "Synthetic", lastName: "Parent", email: "synthetic@example.test" }, service: { id: "centre", name: "Synthetic Centre" }, lineItems: [], payments: [],
  delivery: { status: "failed", attemptCount: 1, nextAttemptAt: null, sentAt: null, errorCode: "PDF_FAILED", canRetry: true },
};
function show(data: StatementDetail = base) {
  vi.mocked(fetchApi).mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<StatementDetailPanel statementId="synthetic" onClose={() => {}} />, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
beforeEach(() => { cleanup(); vi.clearAllMocks(); state.role = "owner"; });

describe("statement delivery controls", () => {
  it("queues through the real mutation hook, disables duplicate clicks, and refreshes delivery state", async () => {
    let resolve!: (value: object) => void;
    vi.mocked(mutateApi).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    show(); const button = await screen.findByRole("button", { name: "Retry delivery" });
    button.focus(); expect(document.activeElement).toBe(button); fireEvent.click(button);
    expect(await screen.findByRole("button", { name: "Queuing retry…" })).toBeDisabled();
    expect(mutateApi).toHaveBeenCalledWith("/api/billing/statements/synthetic/delivery/retry", { method: "POST" });
    vi.mocked(fetchApi).mockResolvedValue({ ...base, delivery: { ...base.delivery!, status: "pending", canRetry: false } });
    resolve({ queued: true });
    expect(await screen.findByText("Delivery queued")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry delivery" })).not.toBeInTheDocument();
  });
  it("shows an actionable error when queuing fails", async () => {
    vi.mocked(mutateApi).mockRejectedValueOnce(new Error("Delivery changed; reload before retrying"));
    show(); fireEvent.click(await screen.findByRole("button", { name: "Retry delivery" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Delivery changed; reload before retrying");
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry delivery" })).not.toBeDisabled());
  });
  it("does not expose retry to a member", async () => {
    state.role = "member"; show(); await screen.findByText("Delivery attempt failed");
    expect(screen.queryByRole("button", { name: "Retry delivery" })).not.toBeInTheDocument();
  });
  it.each([
    ["sent", "Email accepted by provider"], ["needs_review", "Delivery needs review"], ["blocked", "Delivery blocked"], ["cancelled", "Delivery cancelled"],
  ])("explains %s without offering a resend", async (status, text) => {
    show({ ...base, delivery: { ...base.delivery!, status, canRetry: false } });
    expect(await screen.findByText(new RegExp(text))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry delivery" })).not.toBeInTheDocument();
    if (status === "sent") expect(screen.getByText("Provider acceptance does not confirm inbox delivery.")).toBeInTheDocument();
  });
  it("explains legacy history and hides delivery controls for drafts", async () => {
    const view = show({ ...base, delivery: null });
    await screen.findByText("Delivery history is unavailable for this statement");
    view.unmount(); show({ ...base, status: "draft", delivery: null });
    await screen.findByText("Synthetic Parent"); expect(screen.queryByRole("region", { name: "Statement delivery" })).not.toBeInTheDocument();
  });
});

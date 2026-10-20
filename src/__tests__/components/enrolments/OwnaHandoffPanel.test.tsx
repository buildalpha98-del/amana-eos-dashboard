// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "me", role: "owner" } }, status: "authenticated" }),
}));
vi.mock("@/lib/fetch-api", () => ({ fetchApi: vi.fn(), mutateApi: vi.fn() }));
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { OwnaHandoffPanel } from "@/components/enrolments/OwnaHandoffPanel";

const by = { id: "me", name: "Jayden" };
function setup(steps: Record<string, unknown> = {}, status = "processed", placed?: boolean) {
  vi.mocked(fetchApi).mockResolvedValue({
    assignees: [
      { id: "me", name: "Jayden", role: "owner" },
      { id: "m", name: "Mirna", role: "head_office" },
    ],
    scope: "Aysha Chaouk — Unity Grammar",
    revision: 3,
    placement: "p",
    state: { placement: "p", owner: by, note: "", steps },
    history: [],
    ...(placed === undefined ? {} : { placed }),
  });
  vi.mocked(mutateApi).mockResolvedValue({});
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <OwnaHandoffPanel id="e1" status={status} childrenLabel="" />
    </QueryClientProvider>,
  );
}
const body = () => (vi.mocked(mutateApi).mock.calls.at(-1)![1] as { body: Record<string, unknown> }).body;

beforeEach(() => vi.clearAllMocks());

describe("OwnaHandoffPanel", () => {
  it("ticks a step with one click — no notes needed", async () => {
    setup();
    fireEvent.click(await screen.findByLabelText("All children entered and linked in OWNA"));
    await waitFor(() => expect(mutateApi).toHaveBeenCalled());
    expect(body()).toEqual({ action: "complete", step: "children", revision: 3 });
  });

  it("later steps wait for the first one", async () => {
    setup();
    expect(await screen.findByLabelText(/^Parent can access the OWNA app/)).toBeDisabled();
  });

  it("first sessions: casual bookings only", async () => {
    setup({ children: { at: "2026-10-20T00:00:00Z", by, evidence: "" } });
    fireEvent.click(await screen.findByLabelText("First sessions confirmed for all children"));
    fireEvent.click(screen.getByLabelText("Casual bookings only"));
    fireEvent.click(screen.getByRole("button", { name: "Tick it" }));
    await waitFor(() => expect(mutateApi).toHaveBeenCalled());
    expect(body()).toMatchObject({ action: "complete", step: "sessions", casual: true });
  });

  it("first sessions: a date, emailing the family", async () => {
    setup({ children: { at: "2026-10-20T00:00:00Z", by, evidence: "" } });
    fireEvent.click(await screen.findByLabelText("First sessions confirmed for all children"));
    const tick = screen.getByRole("button", { name: "Tick it" });
    expect(tick).toBeDisabled();
    fireEvent.change(screen.getByLabelText("First booked day"), { target: { value: "2026-10-27" } });
    fireEvent.click(tick);
    await waitFor(() => expect(mutateApi).toHaveBeenCalled());
    expect(body()).toMatchObject({ step: "sessions", firstDay: "2026-10-27", notifyFamily: true });
  });

  it("saves notes and assigns an owner from the dropdown", async () => {
    setup();
    fireEvent.change(await screen.findByLabelText("Notes"), { target: { value: "Mum to check junk folder" } });
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }));
    await waitFor(() => expect(body()).toMatchObject({ action: "note", evidence: "Mum to check junk folder" }));
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "m" } });
    await waitFor(() => expect(body()).toMatchObject({ action: "assign", ownerId: "m" }));
    expect(screen.getByRole("option", { name: "Jayden (me)" })).toBeInTheDocument();
  });

  // 2026-10-21: the OWNA handoff can be done BEFORE Confirm.
  it("before approval, children not placed yet: owner yes, tick boxes no", async () => {
    setup({}, "submitted", false);
    expect(await screen.findByText(/tick boxes open once the children are assigned/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^All children entered/)).toBeDisabled();
    expect(screen.getByLabelText("Owner")).not.toBeDisabled();
  });
  it("before approval, children placed: tick away, then press Confirm", async () => {
    setup({}, "submitted", true);
    expect(await screen.findByText(/then press/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^All children entered/)).not.toBeDisabled();
  });
});

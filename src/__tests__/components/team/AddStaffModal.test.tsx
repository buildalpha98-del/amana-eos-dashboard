// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mutateApi = vi.fn(() => Promise.resolve({ id: "u-new" }));
vi.mock("@/lib/fetch-api", () => ({ mutateApi: (...a: unknown[]) => mutateApi(...a) }));
vi.mock("@/hooks/useToast", () => ({ toast: vi.fn() }));

import { AddStaffModal } from "@/components/team/AddStaffModal";

const SERVICES = [
  { id: "svc-1", name: "Mawson Lakes" },
  { id: "svc-2", name: "Bankstown" },
];

function renderModal(role: "owner" | "admin" = "admin") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AddStaffModal open onClose={vi.fn()} services={SERVICES} currentUserRole={role} />
    </QueryClientProvider>,
  );
}

describe("AddStaffModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the centre selector for staff/member and hides it for admin", () => {
    renderModal();
    // default role is staff → centre visible
    expect(screen.getByLabelText("Centre")).toBeInTheDocument();
    // switch to admin → centre hidden
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "admin" } });
    expect(screen.queryByLabelText("Centre")).toBeNull();
  });

  it("reveals the start date only when 'new starter' is toggled on", () => {
    renderModal();
    expect(screen.queryByLabelText("Start date")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByLabelText("Start date")).toBeInTheDocument();
  });

  it("submits invite mode (no password) with the centre for a staff hire", async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jamie New" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jamie@test.com" } });
    fireEvent.change(screen.getByLabelText("Centre"), { target: { value: "svc-2" } });
    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => expect(mutateApi).toHaveBeenCalledTimes(1));
    const [url, opts] = mutateApi.mock.calls[0] as [string, { method: string; body: Record<string, unknown> }];
    expect(url).toBe("/api/users");
    expect(opts.method).toBe("POST");
    expect(opts.body).toMatchObject({ name: "Jamie New", email: "jamie@test.com", role: "staff", serviceId: "svc-2" });
    expect(opts.body).not.toHaveProperty("password");
    expect(opts.body).not.toHaveProperty("newStarter");
  });

  it("includes newStarter + startDate when the toggle is on", async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Starter" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ns@test.com" } });
    fireEvent.change(screen.getByLabelText("Centre"), { target: { value: "svc-1" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-08-01" } });
    fireEvent.click(screen.getByRole("button", { name: /invite new starter/i }));

    await waitFor(() => expect(mutateApi).toHaveBeenCalledTimes(1));
    const [, opts] = mutateApi.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(opts.body.newStarter).toBe(true);
    expect(opts.body.startDate).toContain("2026-08-01");
  });

  it("owner sees the State Manager (head_office) role option; admin does not", () => {
    const { unmount } = renderModal("admin");
    expect(
      Array.from(screen.getByLabelText("Role").querySelectorAll("option")).map((o) => o.value),
    ).not.toContain("head_office");
    unmount();
    renderModal("owner");
    expect(
      Array.from(screen.getByLabelText("Role").querySelectorAll("option")).map((o) => o.value),
    ).toContain("head_office");
  });
});

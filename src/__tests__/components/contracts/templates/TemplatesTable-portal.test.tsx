// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(),
  mutateApi: vi.fn(),
}));

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { fetchApi } from "@/lib/fetch-api";
import { TemplatesTable } from "@/components/contracts/templates/TemplatesTable";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const TEMPLATE = {
  id: "tpl-1",
  name: "Casual Contract",
  description: null,
  contentJson: { type: "doc", content: [] },
  manualFields: [],
  status: "active" as const,
  createdById: "u-1",
  updatedById: null,
  createdAt: "2026-05-01T00:00:00Z",
  updatedAt: "2026-05-01T00:00:00Z",
  createdBy: { id: "u-1", name: "Admin" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchApi).mockResolvedValue([TEMPLATE]);
});

describe("TemplatesTable RowActions dropdown — portal + clipping fix", () => {
  it("renders the dropdown menu into document.body (not inside the table)", async () => {
    const { container } = render(<TemplatesTable />, { wrapper });

    const trigger = await screen.findByLabelText("Template actions");
    await act(async () => {
      fireEvent.click(trigger);
    });

    // The menu element must NOT be a descendant of the rendered
    // container (which represents the table) — that's the whole point
    // of the portal.
    const menu = screen.getByTestId("row-actions-menu");
    expect(menu).toBeInTheDocument();
    expect(container.contains(menu)).toBe(false);
    // It IS appended to document.body
    expect(document.body.contains(menu)).toBe(true);
  });

  it("positions the menu with position: fixed so parent overflow:hidden can't clip it", async () => {
    render(<TemplatesTable />, { wrapper });
    await act(async () => {
      fireEvent.click(await screen.findByLabelText("Template actions"));
    });
    const menu = screen.getByTestId("row-actions-menu");
    expect(menu.style.position).toBe("fixed");
  });

  it("flips the menu above the trigger when there is not enough space below the viewport", async () => {
    // Force a small viewport so the menu can't fit below.
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 200,
    });
    render(<TemplatesTable />, { wrapper });

    const trigger = await screen.findByLabelText("Template actions");
    // Trigger lives near the bottom of the viewport (rect.bottom = 180).
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      top: 160,
      bottom: 180,
      left: 100,
      right: 140,
      width: 40,
      height: 20,
      x: 100,
      y: 160,
      toJSON: () => ({}),
    } as DOMRect);

    await act(async () => {
      fireEvent.click(trigger);
    });

    const menu = screen.getByTestId("row-actions-menu");
    // The menu's top should be ABOVE the trigger (i.e. less than the
    // trigger's top of 160). The exact value depends on measured menu
    // height, but it must be smaller than the trigger top for "above"
    // placement.
    const top = parseFloat(menu.style.top);
    expect(top).toBeLessThan(160);
  });

  it("closes when Escape is pressed", async () => {
    render(<TemplatesTable />, { wrapper });
    await act(async () => {
      fireEvent.click(await screen.findByLabelText("Template actions"));
    });
    expect(screen.getByTestId("row-actions-menu")).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByTestId("row-actions-menu")).not.toBeInTheDocument();
  });

  it("closes when the backdrop is clicked", async () => {
    render(<TemplatesTable />, { wrapper });
    await act(async () => {
      fireEvent.click(await screen.findByLabelText("Template actions"));
    });
    expect(screen.getByTestId("row-actions-menu")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("row-actions-backdrop"));
    });
    expect(screen.queryByTestId("row-actions-menu")).not.toBeInTheDocument();
  });

  it("preserves all four menu items (Edit, Clone, Disable, Delete)", async () => {
    render(<TemplatesTable />, { wrapper });
    await act(async () => {
      fireEvent.click(await screen.findByLabelText("Template actions"));
    });
    const menu = screen.getByTestId("row-actions-menu");
    expect(menu.textContent).toContain("Edit");
    expect(menu.textContent).toContain("Clone");
    // Status is "active" → button reads "Disable"
    expect(menu.textContent).toContain("Disable");
    expect(menu.textContent).toContain("Delete");
  });

  it("renders Enable (not Disable) when the template status is disabled", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce([
      { ...TEMPLATE, status: "disabled" },
    ]);
    render(<TemplatesTable />, { wrapper });
    await act(async () => {
      fireEvent.click(await screen.findByLabelText("Template actions"));
    });
    const menu = screen.getByTestId("row-actions-menu");
    expect(menu.textContent).toContain("Enable");
    expect(menu.textContent).not.toContain("Disable");
  });
});

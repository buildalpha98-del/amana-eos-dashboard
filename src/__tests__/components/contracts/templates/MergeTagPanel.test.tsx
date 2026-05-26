// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/lib/fetch-api", () => ({
  fetchApi: vi.fn(),
  mutateApi: vi.fn(),
}));

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
}));

import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { MergeTagPanel } from "@/components/contracts/templates/MergeTagPanel";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default empty list so initial renders don't hang on the query.
  vi.mocked(fetchApi).mockResolvedValue([]);
  vi.mocked(mutateApi).mockResolvedValue({});
});

describe("MergeTagPanel — Custom Tags section", () => {
  it("renders a Custom Tags section heading below the System tags", () => {
    render(
      <MergeTagPanel onInsert={() => {}} manualFields={[]} />,
      { wrapper },
    );
    expect(screen.getByText("Custom Tags")).toBeInTheDocument();
    // The "+ Add tag" trigger is visible by default
    expect(screen.getByTestId("custom-tags-add")).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no custom tags yet", async () => {
    render(
      <MergeTagPanel onInsert={() => {}} manualFields={[]} />,
      { wrapper },
    );
    await waitFor(() => {
      expect(
        screen.getByText(/No custom tags yet/i),
      ).toBeInTheDocument();
    });
  });

  it("renders saved custom tags as clickable rows that call onInsert with the slugified key", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce([
      {
        id: "t-1",
        key: "custom.projectCode",
        label: "Project Code",
        createdAt: "2026-05-01T00:00:00Z",
      },
    ]);
    const onInsert = vi.fn();
    render(<MergeTagPanel onInsert={onInsert} manualFields={[]} />, {
      wrapper,
    });

    const row = await screen.findByText("Project Code");
    fireEvent.click(row);
    expect(onInsert).toHaveBeenCalledWith("custom.projectCode");
  });

  it("opens an inline form when + Add tag is clicked and previews the slugified key", async () => {
    render(
      <MergeTagPanel onInsert={() => {}} manualFields={[]} />,
      { wrapper },
    );
    fireEvent.click(screen.getByTestId("custom-tags-add"));
    const input = await screen.findByTestId("custom-tags-input");
    fireEvent.change(input, { target: { value: "Project Code" } });
    expect(
      screen.getByText("→ {{custom.projectCode}}"),
    ).toBeInTheDocument();
  });

  it("disables Save until the input has at least one alphanumeric character", async () => {
    render(
      <MergeTagPanel onInsert={() => {}} manualFields={[]} />,
      { wrapper },
    );
    fireEvent.click(screen.getByTestId("custom-tags-add"));
    const input = await screen.findByTestId("custom-tags-input");
    const save = screen.getByTestId("custom-tags-save");
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: "!!!" } });
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: "Hello" } });
    expect(save).not.toBeDisabled();
  });

  it("POSTs the label and inserts the new tag into the list on save", async () => {
    // First GET (on mount) returns empty; later GETs (post-invalidate)
    // return the newly created tag so the optimistic write isn't wiped
    // by the refetch.
    const created = {
      id: "t-new",
      key: "custom.projectCode",
      label: "Project Code",
      createdAt: "2026-05-18T00:00:00Z",
    };
    let getCount = 0;
    vi.mocked(fetchApi).mockImplementation(() => {
      getCount += 1;
      return Promise.resolve(getCount === 1 ? [] : [created]);
    });
    vi.mocked(mutateApi).mockResolvedValueOnce(created);

    render(
      <MergeTagPanel onInsert={() => {}} manualFields={[]} />,
      { wrapper },
    );
    fireEvent.click(screen.getByTestId("custom-tags-add"));
    fireEvent.change(await screen.findByTestId("custom-tags-input"), {
      target: { value: "Project Code" },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("custom-tags-save"));
    });

    expect(mutateApi).toHaveBeenCalledWith(
      "/api/contract-templates/custom-tags",
      expect.objectContaining({
        method: "POST",
        body: { label: "Project Code" },
      }),
    );
    // New tag appears in the list (via optimistic write or refetch)
    await waitFor(() => {
      expect(screen.getByText("Project Code")).toBeInTheDocument();
    });
  });

  it("delete row removes the tag from the panel optimistically", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce([
      {
        id: "t-1",
        key: "custom.projectCode",
        label: "Project Code",
        createdAt: "2026-05-01T00:00:00Z",
      },
    ]);
    // Force `confirm()` to true so the delete handler proceeds.
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValue(true);

    render(
      <MergeTagPanel onInsert={() => {}} manualFields={[]} />,
      { wrapper },
    );

    await screen.findByText("Project Code");
    const delBtn = screen.getByLabelText("Delete Project Code");

    await act(async () => {
      fireEvent.click(delBtn);
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(mutateApi).toHaveBeenCalledWith(
      "/api/contract-templates/custom-tags/t-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    // Optimistic removal — the row should be gone before the network
    // settles.
    await waitFor(() => {
      expect(screen.queryByText("Project Code")).not.toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });

  it("does not delete when the user cancels the confirm dialog", async () => {
    vi.mocked(fetchApi).mockResolvedValueOnce([
      {
        id: "t-1",
        key: "custom.projectCode",
        label: "Project Code",
        createdAt: "2026-05-01T00:00:00Z",
      },
    ]);
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValue(false);

    render(
      <MergeTagPanel onInsert={() => {}} manualFields={[]} />,
      { wrapper },
    );

    await screen.findByText("Project Code");
    fireEvent.click(screen.getByLabelText("Delete Project Code"));

    expect(confirmSpy).toHaveBeenCalled();
    expect(mutateApi).not.toHaveBeenCalled();
    expect(screen.getByText("Project Code")).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("keeps the existing System / Staff / Contract sections unchanged", () => {
    render(
      <MergeTagPanel onInsert={() => {}} manualFields={[]} />,
      { wrapper },
    );
    // Headings from GROUP_LABELS still render
    expect(screen.getByText("Staff")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("Contract")).toBeInTheDocument();
    // A known system tag still renders
    expect(screen.getByText("Staff: First name")).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SectionCard } from "@/components/centre-avatars/SectionCard";

vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

describe("SectionCard — structured form (I3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the snapshot section in form mode by default when editing", () => {
    render(
      <SectionCard
        sectionKey="snapshot"
        title="1. Centre snapshot"
        description="Test"
        content={{ centreDetails: { officialName: "Amana Greystanes" } }}
        onSave={vi.fn()}
        isSaving={false}
      />,
    );

    // Click Edit
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    // The form has a structured "Official name" field (not a JSON textarea)
    expect(screen.getByLabelText(/official name/i)).toBeTruthy();
    expect((screen.getByLabelText(/official name/i) as HTMLInputElement).value).toBe(
      "Amana Greystanes",
    );

    // The mode toggle button shows "Raw JSON" (we're in form mode)
    expect(screen.getByRole("button", { name: /raw json/i })).toBeTruthy();
  });

  it("calls onSave with cleaned form data when Save is clicked", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <SectionCard
        sectionKey="snapshot"
        title="1. Centre snapshot"
        content={{}}
        onSave={onSave}
        isSaving={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.change(screen.getByLabelText(/official name/i), {
      target: { value: "  Test Centre  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    // stripEmpty trimmed the value
    expect(payload).toEqual({
      centreDetails: { officialName: "Test Centre" },
    });
  });

  it("toggles to raw JSON mode and back", () => {
    render(
      <SectionCard
        sectionKey="parentAvatar"
        title="2. Parent avatar"
        content={{ psychographics: { primaryConcern: "safety" } }}
        onSave={vi.fn()}
        isSaving={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    // Switch to Raw JSON
    fireEvent.click(screen.getByRole("button", { name: /raw json/i }));
    expect(screen.getByLabelText(/2\. parent avatar json editor/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /format/i })).toBeTruthy();

    // Switch back to form
    fireEvent.click(screen.getByRole("button", { name: /^form$/i }));
    expect(screen.getByLabelText(/primary concern/i)).toBeTruthy();
  });

  it("ProgrammeMix form supports add + remove rows", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <SectionCard
        sectionKey="programmeMix"
        title="3. Programme mix"
        content={{}}
        onSave={onSave}
        isSaving={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));

    // Add a programme row
    fireEvent.click(screen.getByRole("button", { name: /add programme/i }));
    expect(screen.getByLabelText(/^name$/i)).toBeTruthy();

    // Fill the row
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "STEM Tuesdays" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.programmes).toHaveLength(1);
    expect(payload.programmes[0].name).toBe("STEM Tuesdays");
  });

  it("readOnly=true hides Edit button entirely", () => {
    render(
      <SectionCard
        sectionKey="snapshot"
        title="1. Centre snapshot"
        content={{ centreDetails: { officialName: "Greystanes" } }}
        onSave={vi.fn()}
        isSaving={false}
        readOnly
      />,
    );

    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
    // But the readonly summary still renders
    expect(screen.getByText(/Greystanes/)).toBeTruthy();
  });
});

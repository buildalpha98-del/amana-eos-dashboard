// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StaffModuleRow } from "@/components/lms/StaffModuleRow";
import type { LMSModuleData } from "@/hooks/useLMS";

function makeModule(overrides: Partial<LMSModuleData> & { id: string; title: string }): LMSModuleData {
  return {
    description: null,
    type: "document",
    content: null,
    resourceUrl: null,
    documentId: null,
    duration: null,
    sortOrder: 0,
    isRequired: false,
    ...overrides,
  };
}

describe("StaffModuleRow — training module opens when clicked (bug-6)", () => {
  it("always shows a View button, even when module has no text content", () => {
    // Regression: previously the View button was gated on mod.content, so video
    // and external_link modules (which use resourceUrl, not content) looked
    // like they did nothing when clicked.
    const mod = makeModule({
      id: "m-video",
      title: "Intro video",
      type: "video",
      content: null,
      resourceUrl: "https://example.com/video.mp4",
    });

    render(
      <StaffModuleRow
        mod={mod}
        isComplete={false}
        isExpanded={false}
        onToggleComplete={() => {}}
        onToggleExpand={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
  });

  it("fires onToggleExpand when the title is clicked", () => {
    const mod = makeModule({ id: "m1", title: "Clickable module" });
    const onToggleExpand = vi.fn();

    render(
      <StaffModuleRow
        mod={mod}
        isComplete={false}
        isExpanded={false}
        onToggleComplete={() => {}}
        onToggleExpand={onToggleExpand}
      />,
    );

    fireEvent.click(screen.getByText("Clickable module"));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it("fires onToggleExpand when the View button is clicked", () => {
    const mod = makeModule({ id: "m1", title: "m" });
    const onToggleExpand = vi.fn();

    render(
      <StaffModuleRow
        mod={mod}
        isComplete={false}
        isExpanded={false}
        onToggleComplete={() => {}}
        onToggleExpand={onToggleExpand}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it("renders a Watch Video link for video modules with only a resourceUrl", () => {
    // Core of bug #6: video modules without content used to render nothing
    // when expanded.
    const mod = makeModule({
      id: "m-video",
      title: "Intro video",
      type: "video",
      content: null,
      resourceUrl: "https://example.com/video.mp4",
    });

    render(
      <StaffModuleRow
        mod={mod}
        isComplete={false}
        isExpanded
        onToggleComplete={() => {}}
        onToggleExpand={() => {}}
      />,
    );

    const link = screen.getByRole("link", { name: /Watch Video/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://example.com/video.mp4");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders an Open Resource link for external_link modules with only a resourceUrl", () => {
    const mod = makeModule({
      id: "m-link",
      title: "Helpful reading",
      type: "external_link",
      content: null,
      resourceUrl: "https://example.com/docs",
    });

    render(
      <StaffModuleRow
        mod={mod}
        isComplete={false}
        isExpanded
        onToggleComplete={() => {}}
        onToggleExpand={() => {}}
      />,
    );

    const link = screen.getByRole("link", { name: /Open Resource/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://example.com/docs");
  });

  it("renders text content for document modules when expanded", () => {
    const mod = makeModule({
      id: "m-doc",
      title: "Policy",
      type: "document",
      content: "Here is the policy body.",
    });

    render(
      <StaffModuleRow
        mod={mod}
        isComplete={false}
        isExpanded
        onToggleComplete={() => {}}
        onToggleExpand={() => {}}
      />,
    );

    expect(screen.getByText("Here is the policy body.")).toBeInTheDocument();
  });

  it("shows an explicit empty state when a module has no content and no resourceUrl", () => {
    // Still better than the old behaviour of rendering nothing.
    const mod = makeModule({
      id: "m-empty",
      title: "WIP module",
      type: "quiz",
      content: null,
      resourceUrl: null,
    });

    render(
      <StaffModuleRow
        mod={mod}
        isComplete={false}
        isExpanded
        onToggleComplete={() => {}}
        onToggleExpand={() => {}}
      />,
    );

    expect(
      screen.getByText(/No content available for this module yet/i),
    ).toBeInTheDocument();
  });

  it("does not render expanded content when isExpanded is false", () => {
    const mod = makeModule({
      id: "m1",
      title: "Collapsed",
      type: "video",
      resourceUrl: "https://example.com/v.mp4",
    });

    render(
      <StaffModuleRow
        mod={mod}
        isComplete={false}
        isExpanded={false}
        onToggleComplete={() => {}}
        onToggleExpand={() => {}}
      />,
    );

    expect(screen.queryByRole("link", { name: /Watch Video/i })).not.toBeInTheDocument();
  });

  it("toggles the progress checkbox when clicked", () => {
    const mod = makeModule({ id: "m1", title: "m" });
    const onToggleComplete = vi.fn();

    render(
      <StaffModuleRow
        mod={mod}
        isComplete={false}
        isExpanded={false}
        onToggleComplete={onToggleComplete}
        onToggleExpand={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Mark complete/i }));
    expect(onToggleComplete).toHaveBeenCalledTimes(1);
  });
});

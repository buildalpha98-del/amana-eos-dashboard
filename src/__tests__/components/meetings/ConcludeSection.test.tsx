// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConcludeSection } from "@/components/meetings/ConcludeSection";

describe("ConcludeSection", () => {
  it("defaults to the L10 labels and shows Cascade Messages", () => {
    render(
      <ConcludeSection
        notes=""
        onUpdate={vi.fn()}
        cascadeMessages=""
        onUpdateCascade={vi.fn()}
        rating={null}
        onRate={vi.fn()}
      />,
    );
    expect(screen.getByText("Recap Notes")).toBeInTheDocument();
    expect(screen.getByText("Cascade Messages")).toBeInTheDocument();
  });

  it("Quarterly Pulse: relabels notes, hides cascade, and shows next-meeting capture", () => {
    const onScheduleReminder = vi.fn();
    const onExpectationsMetChange = vi.fn();
    render(
      <ConcludeSection
        notes=""
        onUpdate={vi.fn()}
        cascadeMessages=""
        onUpdateCascade={vi.fn()}
        rating={null}
        onRate={vi.fn()}
        notesLabel="What would make it a 10?"
        showCascade={false}
        nextMeeting={{
          date: "2026-12-15",
          onDateChange: vi.fn(),
          onScheduleReminder,
          reminderScheduled: false,
          expectationsMet: null,
          onExpectationsMetChange,
        }}
      />,
    );

    expect(screen.getByText("What would make it a 10?")).toBeInTheDocument();
    expect(screen.queryByText("Cascade Messages")).not.toBeInTheDocument();
    expect(screen.getByText(/Next Quarterly Pulse Date/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Create reminder to-do/i }));
    expect(onScheduleReminder).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/Expectations for this Quarterly Pulse were met/i));
    expect(onExpectationsMetChange).toHaveBeenCalledWith(true);
  });
});

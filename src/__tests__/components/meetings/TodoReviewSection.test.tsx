// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TodoReviewSection } from "@/components/meetings/TodoReviewSection";
import type { TodoData } from "@/hooks/useTodos";

function todo(overrides: Partial<TodoData>): TodoData {
  return {
    id: "t-1",
    title: "Review the onboarding pack",
    description: null,
    assigneeId: "u1",
    assignee: { id: "u1", name: "Jane Doe" } as TodoData["assignee"],
    rockId: null,
    rock: null,
    issueId: null,
    issue: null,
    serviceId: null,
    isPrivate: false,
    dueDate: "2026-04-25",
    weekOf: "2026-04-20",
    status: "pending",
    completedAt: null,
    createdAt: "2026-04-20T00:00:00Z",
    updatedAt: "2026-04-20T00:00:00Z",
    aiDraftId: null,
    aiDraftStatus: null,
    ...overrides,
  } as TodoData;
}

describe("TodoReviewSection", () => {
  it("renders the To-Do Review heading and completion rate", () => {
    const todos = [
      todo({ id: "t-1", status: "complete" }),
      todo({ id: "t-2", status: "pending" }),
    ];
    render(<TodoReviewSection todos={todos} onToggle={vi.fn()} />);
    expect(screen.getByText("To-Do Review")).toBeInTheDocument();
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
  });

  it("shows the empty state when there are no to-dos", () => {
    render(<TodoReviewSection todos={[]} onToggle={vi.fn()} />);
    expect(screen.getByText(/No to-dos for this week/i)).toBeInTheDocument();
  });

  it("invokes onToggle with the new done state when checkbox is clicked", () => {
    const onToggle = vi.fn();
    const todos = [todo({ id: "t-1", status: "pending", title: "Do the thing" })];
    render(<TodoReviewSection todos={todos} onToggle={onToggle} />);

    // The checkbox is the button immediately preceding the title text
    const checkboxes = screen.getAllByRole("button");
    fireEvent.click(checkboxes[0]);
    expect(onToggle).toHaveBeenCalledWith("t-1", true);
  });
});

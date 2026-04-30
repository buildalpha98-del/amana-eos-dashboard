// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IssueCard } from "@/components/issues/IssueCard";
import type { IssueData } from "@/hooks/useIssues";

function makeIssue(overrides: Partial<IssueData> = {}): IssueData {
  const now = new Date().toISOString();
  return {
    id: "i1",
    title: "Test issue",
    description: null,
    raisedById: "u1",
    raisedBy: { id: "u1", name: "Owner", email: "o@t.com", avatar: null },
    ownerId: null,
    owner: null,
    rockId: null,
    rock: null,
    serviceId: null,
    service: null,
    priority: "high",
    status: "open",
    identifiedAt: now,
    discussedAt: null,
    solvedAt: null,
    resolution: null,
    createdAt: now,
    updatedAt: now,
    _count: { spawnedTodos: 3 },
    ...overrides,
  } as IssueData;
}

describe("IssueCard spawnedTodos badge", () => {
  it("renders the spawned todos count button when count > 0", () => {
    render(<IssueCard issue={makeIssue()} onClick={vi.fn()} />);
    const button = screen.getByRole("button", { name: /3 spawned todos/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("3");
  });

  it("does NOT render the badge button when spawnedTodos count is 0", () => {
    render(
      <IssueCard
        issue={makeIssue({ _count: { spawnedTodos: 0 } })}
        onClick={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /spawned todos/i }),
    ).toBeNull();
  });

  it("clicking the badge invokes onClick with { focus: 'spawnedTodos' } and does not double-fire the card click", () => {
    const handler = vi.fn();
    render(<IssueCard issue={makeIssue()} onClick={handler} />);

    const button = screen.getByRole("button", { name: /3 spawned todos/i });
    fireEvent.click(button);

    // Called exactly once, with the focus hint — stopPropagation prevents the
    // outer card-click from firing a second handler call with no args.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ focus: "spawnedTodos" });
  });
});

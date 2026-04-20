// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IssueKanban } from "@/components/issues/IssueKanban";
import type { IssueData } from "@/hooks/useIssues";

// Mock next-auth session — IssueKanban transitively uses hooks that need it
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "user-1", email: "test@example.com", role: "member" } },
    status: "authenticated",
  }),
}));

// Mock the toast hook used by useUpdateIssue inside IssueKanban
vi.mock("@/hooks/useToast", () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

function makeUser(id: string) {
  return { id, name: `User ${id}`, email: `${id}@example.com`, avatar: null };
}

function makeIssue(overrides: Partial<IssueData> & { id: string; title: string }): IssueData {
  const now = new Date().toISOString();
  return {
    id: overrides.id,
    title: overrides.title,
    description: null,
    raisedById: "user-1",
    raisedBy: makeUser("user-1"),
    ownerId: null,
    owner: null,
    rockId: null,
    rock: null,
    serviceId: null,
    service: null,
    priority: "medium",
    status: "open",
    identifiedAt: now,
    discussedAt: null,
    solvedAt: null,
    resolution: null,
    createdAt: now,
    updatedAt: now,
    _count: { spawnedTodos: 0 },
    ...overrides,
  } as IssueData;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("IssueKanban — closed issues visibility (bug-13)", () => {
  it("renders closed issues in a Closed column when showClosed is true", () => {
    const issues: IssueData[] = [
      makeIssue({ id: "i-open", title: "Open issue title", status: "open" }),
      makeIssue({ id: "i-closed", title: "Closed issue title", status: "closed" }),
    ];

    render(
      <IssueKanban issues={issues} onSelect={() => {}} showClosed />,
      { wrapper: Wrapper },
    );

    // Open issue should always render
    expect(screen.getByText("Open issue title")).toBeInTheDocument();
    // When showClosed is on, closed issues must be visible
    expect(screen.getByText("Closed issue title")).toBeInTheDocument();
  });

  it("hides closed issues when showClosed is false (default)", () => {
    const issues: IssueData[] = [
      makeIssue({ id: "i-open", title: "Open issue title", status: "open" }),
      makeIssue({ id: "i-closed", title: "Closed issue title", status: "closed" }),
    ];

    render(<IssueKanban issues={issues} onSelect={() => {}} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText("Open issue title")).toBeInTheDocument();
    expect(screen.queryByText("Closed issue title")).not.toBeInTheDocument();
  });
});

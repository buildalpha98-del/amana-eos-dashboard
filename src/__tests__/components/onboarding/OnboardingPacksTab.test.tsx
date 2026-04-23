// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OnboardingPacksTab, type OnboardingPacksTabProps } from "@/components/onboarding/OnboardingPacksTab";

function makeMutation(extra: Record<string, unknown> = {}): any {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    status: "idle",
    error: null,
    data: undefined,
    reset: vi.fn(),
    variables: undefined,
    failureCount: 0,
    failureReason: null,
    isPaused: false,
    submittedAt: 0,
    context: undefined,
    ...extra,
  };
}

function makeProps(overrides: Partial<OnboardingPacksTabProps> = {}): OnboardingPacksTabProps {
  return {
    isStaff: false,
    isAdmin: true,
    assignments: [],
    packs: [],
    expandedAssignment: null,
    setExpandedAssignment: vi.fn(),
    selectedPackId: null,
    setSelectedPackId: vi.fn(),
    editingPackId: null,
    setEditingPackId: vi.fn(),
    editPackName: "",
    setEditPackName: vi.fn(),
    editPackDesc: "",
    setEditPackDesc: vi.fn(),
    confirmDeletePackId: null,
    setConfirmDeletePackId: vi.fn(),
    selectedPackData: undefined,
    selectedPackLoading: false,
    updateProgress: makeMutation(),
    editPackMutation: makeMutation(),
    deletePackMutation: makeMutation(),
    handleToggleTask: vi.fn(),
    startEditPack: vi.fn(),
    saveEditPack: vi.fn(),
    handleDeletePack: vi.fn(),
    ...overrides,
  };
}

describe("OnboardingPacksTab", () => {
  it("renders the Onboarding Packs heading for admin view with no packs", () => {
    render(<OnboardingPacksTab {...makeProps()} />);
    expect(screen.getByText("Onboarding Packs")).toBeInTheDocument();
  });

  it("renders empty state when admin has no packs", () => {
    render(<OnboardingPacksTab {...makeProps({ isAdmin: true, packs: [] })} />);
    expect(screen.getByText(/No onboarding packs yet/i)).toBeInTheDocument();
  });

  it("renders provided pack names in the library grid", () => {
    const packs = [
      {
        id: "p1",
        name: "Welcome Pack",
        description: "Initial onboarding",
        isDefault: true,
        service: null,
        _count: { tasks: 5, assignments: 2 },
      },
      {
        id: "p2",
        name: "Advanced Pack",
        description: null,
        isDefault: false,
        service: { name: "Service A" },
        _count: { tasks: 3, assignments: 0 },
      },
    ];
    render(<OnboardingPacksTab {...makeProps({ packs })} />);
    expect(screen.getByText("Welcome Pack")).toBeInTheDocument();
    expect(screen.getByText("Advanced Pack")).toBeInTheDocument();
  });
});

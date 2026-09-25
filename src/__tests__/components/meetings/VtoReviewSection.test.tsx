// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VtoReviewSection } from "@/components/meetings/VtoReviewSection";
import type { VTOData } from "@/hooks/useVTO";

function vto(overrides: Partial<VTOData>): VTOData {
  return {
    id: "vto-1",
    coreValues: ["Integrity"],
    corePurpose: "Serve families",
    coreNiche: "OSHC",
    tenYearTarget: "Be the best",
    threeYearPicture: "Growing",
    threeYearFutureDate: null,
    threeYearRevenue: null,
    threeYearProfit: null,
    threeYearMeasurables: null,
    threeYearLooksLike: null,
    oneYearFutureDate: null,
    oneYearRevenue: "1M",
    oneYearProfit: null,
    oneYearMeasurables: null,
    marketingStrategy: null,
    gtmTargetMarket: "Parents",
    gtmThreeUniques: "Values-led",
    gtmProvenProcess: "Enrolment flow",
    gtmGuarantee: "Satisfaction",
    sectionLabels: null,
    updatedAt: "2026-04-20T00:00:00Z",
    updatedBy: null,
    oneYearGoals: [{ id: "g1", title: "Goal", description: null, targetDate: null, status: "on_track", smart: false, vtoId: "vto-1", rocks: [], createdAt: "", updatedAt: "" }],
    ...overrides,
  };
}

describe("VtoReviewSection", () => {
  it("shows the no-V/TO empty state", () => {
    render(<VtoReviewSection vto={undefined} users={[]} />);
    expect(screen.getByText(/No V\/TO found/i)).toBeInTheDocument();
  });

  it("flags a blank section and offers to assign an owner", () => {
    const data = vto({ corePurpose: "" });
    render(<VtoReviewSection vto={data} users={[{ id: "u1", name: "Jane" }]} onCreateTodo={vi.fn()} />);
    expect(screen.getByText(/Core Purpose is blank/i)).toBeInTheDocument();
  });

  it("shows everything-filled state when nothing is blank", () => {
    const data = vto({});
    render(<VtoReviewSection vto={data} users={[]} />);
    expect(screen.getByText(/Every section has content/i)).toBeInTheDocument();
  });

  it("creates a to-do for a blank field once an owner + date are picked", () => {
    const onCreateTodo = vi.fn();
    const data = vto({ tenYearTarget: "" });
    render(
      <VtoReviewSection
        vto={data}
        users={[{ id: "u1", name: "Jane Doe" }]}
        onCreateTodo={onCreateTodo}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Assign/i }));
    fireEvent.change(screen.getByLabelText(/Owner for 10-Year Target/i), {
      target: { value: "u1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create To-Do/i }));

    expect(onCreateTodo).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeId: "u1", title: expect.stringContaining("10-Year Target") }),
    );
  });
});

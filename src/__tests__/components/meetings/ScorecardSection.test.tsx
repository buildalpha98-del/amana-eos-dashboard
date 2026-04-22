// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScorecardSection } from "@/components/meetings/ScorecardSection";
import type { ScorecardData } from "@/hooks/useScorecard";

const SAMPLE_SCORECARD: ScorecardData = {
  id: "sc-1",
  title: "Weekly",
  measurables: [
    {
      id: "meas-1",
      title: "New leads",
      description: null,
      ownerId: "u1",
      owner: { id: "u1", name: "Jane Doe" } as ScorecardData["measurables"][0]["owner"],
      goalValue: 10,
      goalDirection: "above",
      unit: null,
      frequency: "weekly",
      rockId: null,
      rock: null,
      serviceId: null,
      service: null,
      entries: [
        { id: "e-1", value: 5, onTrack: false, weekOf: "2026-04-20" } as ScorecardData["measurables"][0]["entries"][0],
      ],
    },
    {
      id: "meas-2",
      title: "Customer NPS",
      description: null,
      ownerId: "u2",
      owner: { id: "u2", name: "John Smith" } as ScorecardData["measurables"][0]["owner"],
      goalValue: 50,
      goalDirection: "above",
      unit: null,
      frequency: "weekly",
      rockId: null,
      rock: null,
      serviceId: null,
      service: null,
      entries: [
        { id: "e-2", value: 60, onTrack: true, weekOf: "2026-04-20" } as ScorecardData["measurables"][0]["entries"][0],
      ],
    },
  ],
};

describe("ScorecardSection", () => {
  it("renders the Weekly Scorecard heading and helper text", () => {
    render(<ScorecardSection scorecard={SAMPLE_SCORECARD} />);
    expect(screen.getByText("Weekly Scorecard")).toBeInTheDocument();
    expect(screen.getByText(/Review whether each measurable hit its goal/i)).toBeInTheDocument();
  });

  it("renders one row per measurable and shows titles", () => {
    render(<ScorecardSection scorecard={SAMPLE_SCORECARD} />);
    expect(screen.getByText("New leads")).toBeInTheDocument();
    expect(screen.getByText("Customer NPS")).toBeInTheDocument();
  });

  it("shows an empty placeholder when scorecard is undefined", () => {
    render(<ScorecardSection scorecard={undefined} />);
    expect(screen.getByText(/No scorecard data available/i)).toBeInTheDocument();
  });

  it("fires onDropToIDS when the IDS button is clicked for an off-track measurable", () => {
    const onDropToIDS = vi.fn();
    render(<ScorecardSection scorecard={SAMPLE_SCORECARD} onDropToIDS={onDropToIDS} />);

    const idsButton = screen.getByText("→ IDS");
    fireEvent.click(idsButton);
    expect(onDropToIDS).toHaveBeenCalledWith(expect.stringMatching(/Off-track: New leads/i));
  });
});

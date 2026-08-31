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
    expect(
      screen.getByText(/Discuss only what.s off track/i),
    ).toBeInTheDocument();
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

    // Grid layout renders an icon + "IDS" rather than the old "→ IDS".
    const idsButton = screen.getByTitle("Add this to the IDS list");
    fireEvent.click(idsButton);
    expect(onDropToIDS).toHaveBeenCalledWith(expect.stringMatching(/Off-track: New leads/i));
  });
});

describe("ScorecardSection — editing during the meeting", () => {
  /** The grid view is where the week columns live. */
  function renderGrid(onEntrySubmit = vi.fn()) {
    window?.localStorage?.setItem("scorecard-view", "grid");
    const utils = render(
      <ScorecardSection scorecard={SAMPLE_SCORECARD} onEntrySubmit={onEntrySubmit} />,
    );
    return { ...utils, onEntrySubmit };
  }

  it("records a figure against the week whose cell was clicked", () => {
    // The point of the change: a number often lands after the fact — an
    // activation nobody had counted, a correction — and the L10 is when
    // someone notices. Filing it against the CURRENT week would put the
    // fix on the wrong row.
    const { onEntrySubmit } = renderGrid();

    const cells = screen.getAllByTitle(/Click to update/i);
    expect(cells.length).toBeGreaterThan(0);

    fireEvent.click(cells[0]);
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.blur(input);

    expect(onEntrySubmit).toHaveBeenCalledTimes(1);
    const [measurableId, value, weekOf] = onEntrySubmit.mock.calls[0];
    expect(measurableId).toBe("meas-1");
    expect(value).toBe(12);
    // A week must always be supplied — the handler defaults to "now"
    // when it isn't, which is the bug this guards.
    expect(typeof weekOf).toBe("string");
    expect(weekOf.length).toBeGreaterThan(0);
  });

  it("offers editing on PAST weeks, not just the current one", () => {
    renderGrid();
    // Previously only the first column was clickable. If more than one
    // week column is rendered, more than one should be editable.
    const editable = screen.getAllByTitle(/Click to update/i);
    const weeksOffered = new Set(editable.map((el) => el.getAttribute("title")));
    expect(editable.length).toBeGreaterThanOrEqual(weeksOffered.size);
  });

  it("offers no editing at all once the meeting is completed", () => {
    window?.localStorage?.setItem("scorecard-view", "grid");
    render(
      <ScorecardSection
        scorecard={SAMPLE_SCORECARD}
        onEntrySubmit={vi.fn()}
        isCompleted
      />,
    );
    expect(screen.queryAllByTitle(/Click to update/i)).toHaveLength(0);
  });
});

// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TimesheetTab } from "@/components/staff/tabs/TimesheetTab";

describe("TimesheetTab", () => {
  it("renders empty message when no timesheets", () => {
    const { container } = render(
      <TimesheetTab targetUserId="u1" weeks={[]} canSubmit={false} />,
    );
    expect(container.textContent).toContain("No timesheet entries");
  });

  it("renders week rows with hours and humanized status", () => {
    const { container } = render(
      <TimesheetTab
        targetUserId="u1"
        weeks={[
          { weekEnding: new Date("2026-04-20"), totalHours: 38.5, status: "ts_approved" },
          { weekEnding: new Date("2026-04-13"), totalHours: 40, status: "ts_draft" },
        ]}
        canSubmit={false}
      />,
    );
    expect(container.textContent).toContain("38.5");
    expect(container.textContent).toContain("40.0");
    expect(container.textContent).toContain("Approved");
    expect(container.textContent).toContain("Draft");
  });

  it("shows Submit hours link only when canSubmit is true", () => {
    const { container: a } = render(
      <TimesheetTab targetUserId="u1" weeks={[]} canSubmit={false} />,
    );
    expect(a.textContent).not.toContain("Submit hours");

    const { container: b } = render(
      <TimesheetTab targetUserId="u1" weeks={[]} canSubmit={true} />,
    );
    expect(b.textContent).toContain("Submit hours");
  });

  it("renders View all link with userId filter", () => {
    const { container } = render(
      <TimesheetTab targetUserId="u1" weeks={[]} canSubmit={false} />,
    );
    const link = container.querySelector('a[href="/timesheets?userId=u1"]');
    expect(link).not.toBeNull();
  });
});

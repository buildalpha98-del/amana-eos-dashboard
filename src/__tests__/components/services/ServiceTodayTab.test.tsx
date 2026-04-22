// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// ─── Mocks ───────────────────────────────────────────────────────

// Replace the real panel with a stub that echoes its props — we only care
// that the wrapper threads `serviceId` through correctly. The real panel is
// tested indirectly via other suites and behaviourally via e2e.
const panelSpy = vi.fn();
vi.mock("@/components/services/ServiceTodayPanel", () => ({
  ServiceTodayPanel: (props: { serviceId: string }) => {
    panelSpy(props);
    return (
      <div data-testid="today-panel-stub">
        panel-for:{props.serviceId}
      </div>
    );
  },
}));

import { ServiceTodayTab } from "@/components/services/ServiceTodayTab";

// ─── Tests ───────────────────────────────────────────────────────

describe("ServiceTodayTab", () => {
  it("renders ServiceTodayPanel with the serviceId prop", () => {
    render(<ServiceTodayTab serviceId="svc-123" />);

    expect(screen.getByTestId("today-panel-stub")).toBeDefined();
    expect(screen.getByText(/panel-for:svc-123/)).toBeDefined();
    expect(panelSpy).toHaveBeenCalledWith({ serviceId: "svc-123" });
  });

  it("accepts an optional serviceName without passing it to the panel", () => {
    // Panel currently only needs serviceId — wrapper accepts serviceName for
    // forward-compat (future header additions).
    panelSpy.mockClear();
    render(
      <ServiceTodayTab serviceId="svc-456" serviceName="Centre Alpha" />,
    );
    expect(panelSpy).toHaveBeenCalledWith({ serviceId: "svc-456" });
  });

  it("wraps the panel in a spacing container", () => {
    const { container } = render(<ServiceTodayTab serviceId="svc-789" />);
    // First child of rendered output is the wrapper div
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).toBeTruthy();
    expect(wrapper.className).toContain("space-y-6");
  });
});

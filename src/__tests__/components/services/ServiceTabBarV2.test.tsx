// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Building2, BookOpen, ShieldCheck } from "lucide-react";
import {
  ServiceTabBarV2,
  type TabBarGroup,
} from "@/components/services/ServiceTabBarV2";

const groups: TabBarGroup[] = [
  { key: "today", label: "Today", icon: Building2, subTabs: [] },
  {
    key: "program",
    label: "Program",
    icon: BookOpen,
    subTabs: [
      { key: "activities", label: "Activities", icon: BookOpen },
      { key: "menu", label: "Menu", icon: BookOpen },
    ],
  },
  {
    key: "compliance",
    label: "Compliance",
    icon: ShieldCheck,
    subTabs: [{ key: "qip", label: "QIP", icon: ShieldCheck }],
  },
];

describe("ServiceTabBarV2", () => {
  it("renders all groups", () => {
    render(
      <ServiceTabBarV2
        groups={groups}
        activeGroup="today"
        onGroupChange={() => {}}
      />,
    );
    expect(screen.getAllByText("Today").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Program").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Compliance").length).toBeGreaterThan(0);
  });

  it("highlights the active group via aria-pressed", () => {
    render(
      <ServiceTabBarV2
        groups={groups}
        activeGroup="program"
        onGroupChange={() => {}}
      />,
    );
    const buttons = screen.getAllByRole("button", { name: /Program/ });
    // The desktop pill is the one with aria-pressed
    const programPill = buttons.find((b) => b.getAttribute("aria-pressed") === "true");
    expect(programPill).toBeTruthy();
  });

  it("fires onGroupChange when a group is clicked", () => {
    const onGroupChange = vi.fn();
    render(
      <ServiceTabBarV2
        groups={groups}
        activeGroup="today"
        onGroupChange={onGroupChange}
      />,
    );
    const buttons = screen.getAllByRole("button", { name: /Program/ });
    // Click the desktop pill (skip the mobile dropdown button variant)
    const desktopBtn = buttons.find((b) => b.hasAttribute("aria-pressed"));
    fireEvent.click(desktopBtn!);
    expect(onGroupChange).toHaveBeenCalledWith("program");
  });

  it("renders sub-tabs only for the active group", () => {
    const { rerender } = render(
      <ServiceTabBarV2
        groups={groups}
        activeGroup="today"
        onGroupChange={() => {}}
      />,
    );
    expect(screen.queryByText("Activities")).toBeNull();
    expect(screen.queryByText("Menu")).toBeNull();

    rerender(
      <ServiceTabBarV2
        groups={groups}
        activeGroup="program"
        onGroupChange={() => {}}
      />,
    );
    expect(screen.getByText("Activities")).toBeTruthy();
    expect(screen.getByText("Menu")).toBeTruthy();
  });

  it("fires onSubChange when a sub-pill is clicked", () => {
    const onSubChange = vi.fn();
    render(
      <ServiceTabBarV2
        groups={groups}
        activeGroup="program"
        activeSub="activities"
        onGroupChange={() => {}}
        onSubChange={onSubChange}
      />,
    );
    fireEvent.click(screen.getByText("Menu"));
    expect(onSubChange).toHaveBeenCalledWith("menu");
  });

  it("renders badge counts on groups", () => {
    render(
      <ServiceTabBarV2
        groups={groups}
        activeGroup="today"
        onGroupChange={() => {}}
        badgeFor={(k) => (k === "program" ? 3 : 0)}
      />,
    );
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });
});

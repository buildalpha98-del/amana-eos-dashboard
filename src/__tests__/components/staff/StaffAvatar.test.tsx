// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StaffAvatar } from "@/components/staff/StaffAvatar";

describe("StaffAvatar", () => {
  it("renders photo when avatar URL present", () => {
    const { container } = render(
      <StaffAvatar user={{ id: "u1", name: "Jane Doe", avatar: "/avatars/u1.jpg" }} size="md" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("/avatars/u1.jpg");
    expect(img?.getAttribute("alt")).toBe("Jane Doe");
  });

  it("renders initials when avatar URL absent", () => {
    const { container } = render(
      <StaffAvatar user={{ id: "u1", name: "Jane Doe", avatar: null }} size="md" />,
    );
    expect(container.textContent).toContain("JD");
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders single initial when name is one word", () => {
    const { container } = render(
      <StaffAvatar user={{ id: "u1", name: "Jane", avatar: null }} size="sm" />,
    );
    expect(container.textContent?.trim()).toBe("J");
  });

  it("applies size classes", () => {
    const { container: xs } = render(
      <StaffAvatar user={{ id: "u1", name: "J", avatar: null }} size="xs" />,
    );
    expect(xs.firstChild).toHaveClass("h-6", "w-6");

    const { container: lg } = render(
      <StaffAvatar user={{ id: "u1", name: "J", avatar: null }} size="lg" />,
    );
    expect(lg.firstChild).toHaveClass("h-24", "w-24");
  });
});

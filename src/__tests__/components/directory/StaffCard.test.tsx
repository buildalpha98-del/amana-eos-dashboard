// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StaffCard } from "@/components/directory/StaffCard";
import { Role } from "@prisma/client";

// next/link — render a plain <a> so href is observable and we don't need
// a Next router context for the unit test.
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const BASE_USER = {
  id: "user-1",
  name: "Jane Doe",
  avatar: null,
  role: Role.staff,
  email: "jane@amana.example.com",
  service: { name: "Parramatta" },
};

describe("StaffCard", () => {
  it("links to /staff/[id]", () => {
    const { container } = render(
      <StaffCard user={BASE_USER} showRole={true} showEmail={true} />,
    );
    const anchor = container.querySelector("a");
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("href")).toBe("/staff/user-1");
  });

  it("renders name and service name", () => {
    render(
      <StaffCard user={BASE_USER} showRole={false} showEmail={false} />,
    );
    expect(screen.getByText("Jane Doe")).toBeTruthy();
    expect(screen.getByText("Parramatta")).toBeTruthy();
  });

  it("hides RoleBadge when showRole is false", () => {
    const { queryByText } = render(
      <StaffCard user={BASE_USER} showRole={false} showEmail={false} />,
    );
    // RoleBadge shows "Staff" for role=staff. With showRole=false it should not render.
    expect(queryByText("Staff")).toBeNull();
  });

  it("shows RoleBadge when showRole is true", () => {
    const { getByText } = render(
      <StaffCard
        user={{ ...BASE_USER, role: Role.admin }}
        showRole={true}
        showEmail={false}
      />,
    );
    expect(getByText("Admin")).toBeTruthy();
  });

  it("hides email when showEmail is false", () => {
    const { queryByText } = render(
      <StaffCard user={BASE_USER} showRole={false} showEmail={false} />,
    );
    expect(queryByText("jane@amana.example.com")).toBeNull();
  });

  it("shows email when showEmail is true and email present", () => {
    const { getByText } = render(
      <StaffCard user={BASE_USER} showRole={false} showEmail={true} />,
    );
    expect(getByText("jane@amana.example.com")).toBeTruthy();
  });

  it("omits email row when showEmail=true but email missing", () => {
    const { container } = render(
      <StaffCard
        user={{ ...BASE_USER, email: undefined }}
        showRole={false}
        showEmail={true}
      />,
    );
    expect(container.textContent).not.toContain("@");
  });

  it("omits service row when service missing", () => {
    const { queryByText } = render(
      <StaffCard
        user={{ ...BASE_USER, service: null }}
        showRole={false}
        showEmail={false}
      />,
    );
    expect(queryByText("Parramatta")).toBeNull();
  });
});

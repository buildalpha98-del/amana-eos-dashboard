// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { RoleBadge } from "@/components/staff/RoleBadge";
import { Role } from "@prisma/client";

describe("RoleBadge", () => {
  it("renders role label", () => {
    const { container } = render(<RoleBadge role={Role.admin} />);
    expect(container.textContent).toContain("Admin");
  });

  it("applies distinct classes per role", () => {
    const { container: a } = render(<RoleBadge role={Role.owner} />);
    const { container: b } = render(<RoleBadge role={Role.staff} />);
    expect((a.firstChild as HTMLElement | null)?.className).not.toBe(
      (b.firstChild as HTMLElement | null)?.className,
    );
  });

  it("renders all 7 roles without throwing", () => {
    const roles: Role[] = ["owner", "head_office", "admin", "marketing", "member", "staff"];
    for (const role of roles) {
      expect(() => render(<RoleBadge role={role} />)).not.toThrow();
    }
  });
});

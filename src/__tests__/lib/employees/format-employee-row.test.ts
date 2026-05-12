import { describe, it, expect } from "vitest";
import {
  formatEmployeeRow,
  type EmployeeRowInput,
} from "@/lib/employees/format-employee-row";

function makeInput(overrides: Partial<EmployeeRowInput> = {}): EmployeeRowInput {
  return {
    id: "u-1",
    name: "Alice Adams",
    email: "alice@example.com",
    avatar: null,
    phone: "0400000001",
    role: "staff",
    active: true,
    lastLoginAt: new Date("2026-04-01"),
    tags: [],
    service: { id: "svc-1", name: "Mawson Lakes" },
    ...overrides,
  };
}

describe("formatEmployeeRow", () => {
  it("projects all fields for an admin viewer", () => {
    const out = formatEmployeeRow(makeInput(), "admin");
    expect(out).toMatchObject({
      id: "u-1",
      name: "Alice Adams",
      email: "alice@example.com",
      avatar: null,
      phone: "0400000001",
      role: "staff",
      service: { id: "svc-1", name: "Mawson Lakes" },
      status: "active",
    });
  });

  it("projects all fields for member / staff viewers", () => {
    for (const role of ["member", "staff"] as const) {
      const out = formatEmployeeRow(makeInput(), role);
      expect(out.email, `viewer=${role}`).toBe("alice@example.com");
      expect(out.phone, `viewer=${role}`).toBe("0400000001");
    }
  });

  it("strips email + phone for marketing viewer", () => {
    const out = formatEmployeeRow(makeInput(), "marketing");
    expect(out.email).toBe(null);
    expect(out.phone).toBe(null);
    // Other fields preserved
    expect(out.name).toBe("Alice Adams");
    expect(out.role).toBe("staff");
    expect(out.service).toEqual({ id: "svc-1", name: "Mawson Lakes" });
  });

  it("derives status=active when active=true and lastLoginAt is set", () => {
    expect(formatEmployeeRow(makeInput(), "admin").status).toBe("active");
  });

  it("derives status=pending when active=true but lastLoginAt is null", () => {
    const out = formatEmployeeRow(
      makeInput({ lastLoginAt: null }),
      "admin",
    );
    expect(out.status).toBe("pending");
  });

  it("derives status=deactivated when active=false (regardless of lastLoginAt)", () => {
    expect(
      formatEmployeeRow(makeInput({ active: false, lastLoginAt: null }), "admin").status,
    ).toBe("deactivated");
    expect(
      formatEmployeeRow(makeInput({ active: false, lastLoginAt: new Date() }), "admin").status,
    ).toBe("deactivated");
  });

  it("returns null service when user has no service assigned", () => {
    const out = formatEmployeeRow(
      makeInput({ service: null }),
      "admin",
    );
    expect(out.service).toBe(null);
  });
});

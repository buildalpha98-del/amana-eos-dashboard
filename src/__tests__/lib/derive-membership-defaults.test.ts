import { describe, it, expect } from "vitest";
import { deriveMembershipDefaults } from "@/lib/derive-membership-defaults";
import type { Role } from "@prisma/client";

const baseUser = (overrides: Partial<{
  id: string;
  role: Role;
  createdAt: Date;
}> = {}) => ({
  id: "u1",
  role: "staff" as Role,
  createdAt: new Date("2026-01-15T00:00:00Z"),
  ...overrides,
});

describe("deriveMembershipDefaults", () => {
  it("maps staff → Educator / contributor", () => {
    const d = deriveMembershipDefaults(baseUser({ role: "staff" }));
    expect(d.roleAtService).toBe("Educator");
    expect(d.accessLevel).toBe("contributor");
  });

  it("maps member (OSHC Educator) → OSHC Educator / admin", () => {
    const d = deriveMembershipDefaults(baseUser({ role: "member" }));
    expect(d.roleAtService).toBe("OSHC Educator");
    expect(d.accessLevel).toBe("admin");
  });

  it("maps marketing → Marketing / contributor", () => {
    const d = deriveMembershipDefaults(baseUser({ role: "marketing" }));
    expect(d.roleAtService).toBe("Marketing");
    expect(d.accessLevel).toBe("contributor");
  });

  it("maps admin → Admin / admin", () => {
    const d = deriveMembershipDefaults(baseUser({ role: "admin" }));
    expect(d.roleAtService).toBe("Admin");
    expect(d.accessLevel).toBe("admin");
  });

  it("maps head_office → State Manager / admin", () => {
    const d = deriveMembershipDefaults(baseUser({ role: "head_office" }));
    expect(d.roleAtService).toBe("State Manager");
    expect(d.accessLevel).toBe("admin");
  });

  it("maps owner → Owner / admin", () => {
    const d = deriveMembershipDefaults(baseUser({ role: "owner" }));
    expect(d.roleAtService).toBe("Owner");
    expect(d.accessLevel).toBe("admin");
  });

  it("uses User.createdAt as derived startDate (ISO date string, YYYY-MM-DD)", () => {
    const d = deriveMembershipDefaults(
      baseUser({ createdAt: new Date("2026-03-14T12:34:56Z") }),
    );
    expect(d.startDate).toBe("2026-03-14");
  });

  it("returns null endDate and active status as Primary defaults", () => {
    const d = deriveMembershipDefaults(baseUser());
    expect(d.endDate).toBeNull();
    expect(d.status).toBe("active");
  });
});

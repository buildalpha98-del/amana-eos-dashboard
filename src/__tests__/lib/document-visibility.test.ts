import { describe, it, expect } from "vitest";
import { documentVisibilityWhere, documentVisibilitySql } from "@/lib/document-visibility";

describe("documentVisibilityWhere", () => {
  it.each(["owner", "admin", "head_office"])("%s sees everything", (role) => {
    expect(documentVisibilityWhere({ id: "u", role })).toEqual({});
  });

  it("an Educator sees published docs, their centre, AI knowledge and their own uploads — never loose or personal files", () => {
    const where = documentVisibilityWhere({ id: "u1", role: "staff", serviceId: "svc-1" });
    expect(where.assignedToId).toBeNull();
    expect(where.OR).toEqual([
      { allServices: true },
      { centreId: "svc-1" },
      { fileUrl: "internal://knowledge" },
      { fileUrl: { contains: "/ai-knowledge/" } },
      { uploadedById: "u1" },
    ]);
    // The loose-upload branch that leaked Akram's contract is gone.
    expect(where.OR).not.toContainEqual({ centreId: null });
  });

  it("a centre role with no centre gets no centre branch", () => {
    const where = documentVisibilityWhere({ id: "u1", role: "member", serviceId: null });
    expect(where.OR).not.toContainEqual(expect.objectContaining({ centreId: expect.anything() }));
  });

  it("non-admin office roles see any centre's docs but still not loose ones", () => {
    const where = documentVisibilityWhere({ id: "u2", role: "marketing" });
    expect(where.OR).toContainEqual({ centreId: { not: null } });
    expect(where.assignedToId).toBeNull();
  });
});

describe("documentVisibilitySql", () => {
  it("numbers its parameters from the given offset", () => {
    const { sql, params } = documentVisibilitySql({ id: "u1", role: "staff", serviceId: "svc-1" }, 3);
    expect(sql).toContain(`d."centreId" = $6`);
    expect(sql).toContain(`d."uploadedById" = $5`);
    expect(params).toEqual(["internal://knowledge", "%/ai-knowledge/%", "u1", "svc-1"]);
  });

  it("a centre role with no centre matches no centre docs", () => {
    const { sql, params } = documentVisibilitySql({ id: "u1", role: "staff", serviceId: null }, 3);
    expect(sql).toContain("OR FALSE");
    expect(params).toHaveLength(3);
  });

  it("is TRUE for admins", () => {
    expect(documentVisibilitySql({ id: "u", role: "owner" }, 3)).toEqual({ sql: "TRUE", params: [] });
  });
});

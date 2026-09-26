import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const { getCentreScope } = vi.hoisted(() => ({ getCentreScope: vi.fn() }));
vi.mock("@/lib/centre-scope", () => ({ getCentreScope }));

import { buildKnowledgeScope } from "@/lib/knowledge/scope";

const session = (user: Record<string, unknown>) => ({ user, expires: "" }) as never;

describe("buildKnowledgeScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.service.findUnique.mockResolvedValue({ state: "New South Wales" });
    prismaMock.user.findUnique.mockResolvedValue({ state: "VIC" });
  });

  it("owner → unscoped, no state", async () => {
    getCentreScope.mockResolvedValue({ serviceIds: null });
    expect(await buildKnowledgeScope(session({ id: "u", role: "owner" }))).toEqual({
      role: "owner", serviceIds: null, state: null,
    });
  });

  it("head_office → getCentreScope ids + User.state", async () => {
    getCentreScope.mockResolvedValue({ serviceIds: ["s1", "s2"] });
    expect(await buildKnowledgeScope(session({ id: "u", role: "head_office" }))).toEqual({
      role: "head_office", serviceIds: ["s1", "s2"], state: "VIC",
    });
  });

  it("staff → getCentreScope ids + primary Service.state canonicalised", async () => {
    getCentreScope.mockResolvedValue({ serviceIds: ["s1"] });
    expect(await buildKnowledgeScope(session({ id: "u", role: "staff", serviceId: "s1" }))).toEqual({
      role: "staff", serviceIds: ["s1"], state: "NSW",
    });
  });

  it("staff with no primary service → [] and null state", async () => {
    getCentreScope.mockResolvedValue({ serviceIds: [] });
    expect(await buildKnowledgeScope(session({ id: "u", role: "staff", serviceId: null }))).toEqual({
      role: "staff", serviceIds: [], state: null,
    });
    expect(prismaMock.service.findUnique).not.toHaveBeenCalled();
  });
});

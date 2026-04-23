import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { resolveParentContactForService } from "@/lib/parent-contact";

const parent = {
  email: "Jayden@Example.com", // mixed case — should be lowercased
  name: "Jayden",
  enrolmentIds: ["enrol-1"],
};

describe("resolveParentContactForService", () => {
  beforeEach(() => {
    prismaMock.centreContact.findFirst.mockReset();
  });

  it("queries by lowercased email + service", async () => {
    prismaMock.centreContact.findFirst.mockResolvedValue({
      id: "cc1",
      email: "jayden@example.com",
      serviceId: "s1",
    });
    const result = await resolveParentContactForService(parent, "s1");
    expect(result?.id).toBe("cc1");
    expect(prismaMock.centreContact.findFirst).toHaveBeenCalledWith({
      where: { email: "jayden@example.com", serviceId: "s1" },
    });
  });

  it("returns null when no contact exists", async () => {
    prismaMock.centreContact.findFirst.mockResolvedValue(null);
    const result = await resolveParentContactForService(parent, "s-unknown");
    expect(result).toBeNull();
  });
});

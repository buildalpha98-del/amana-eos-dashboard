import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
import { ensureEssentialEnrolments } from "@/lib/essential-enrolment";

describe("ensureEssentialEnrolments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enrols a staff member in every published essential, skipping existing ones", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ active: true, role: "staff", isCentreAccount: false } as never);
    prismaMock.lMSCourse.findMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }] as never);
    prismaMock.lMSEnrollment.createMany.mockResolvedValue({ count: 2 } as never);
    expect(await ensureEssentialEnrolments("u1")).toBe(2);
    expect(prismaMock.lMSEnrollment.createMany).toHaveBeenCalledWith({
      data: [{ userId: "u1", courseId: "c1" }, { userId: "u1", courseId: "c2" }],
      skipDuplicates: true,
    });
    expect(prismaMock.lMSCourse.findMany.mock.calls[0][0].where).toEqual({
      track: "essential", status: "published", deleted: false,
    });
  });

  it.each(["owner", "admin", "head_office", "marketing"])("leaves exempt role %s alone", async (role) => {
    prismaMock.user.findUnique.mockResolvedValue({ active: true, role, isCentreAccount: false } as never);
    expect(await ensureEssentialEnrolments("u1")).toBe(0);
    expect(prismaMock.lMSEnrollment.createMany).not.toHaveBeenCalled();
  });

  it("leaves centre mailboxes alone", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ active: true, role: "member", isCentreAccount: true } as never);
    expect(await ensureEssentialEnrolments("u1")).toBe(0);
  });

  it("never throws", async () => {
    prismaMock.user.findUnique.mockRejectedValue(new Error("db"));
    await expect(ensureEssentialEnrolments("u1")).resolves.toBe(0);
  });
});

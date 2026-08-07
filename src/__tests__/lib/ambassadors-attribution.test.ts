import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { resolveAttribution } from "@/lib/ambassadors/attribution";

const STAFF = [
  { id: "u-aisha", name: "Aisha Rahman" },
  { id: "u-bilal", name: "Bilal Khan" },
  { id: "u-sara", name: "Sara Ahmed" },
];

function mockRefCode(code: string | null, userId?: string) {
  prismaMock.educatorRefCode.findUnique.mockImplementation(
    async ({ where }: { where: { code: string } }) =>
      code && where.code === code
        ? { code, active: true, user: { id: userId, active: true } }
        : null,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findMany.mockResolvedValue(STAFF);
  mockRefCode(null);
});

describe("resolveAttribution", () => {
  it("ref code only → qr_ref, credited", async () => {
    mockRefCode("ABC234", "u-aisha");
    const r = await resolveAttribution({
      refCode: "ABC234",
      namedEducatorText: null,
      serviceId: "svc-1",
    });
    expect(r).toMatchObject({
      creditedEducatorId: "u-aisha",
      attributionSource: "qr_ref",
      attributionConflict: false,
    });
  });

  it("named educator only (exact full name, case-insensitive) → form_field", async () => {
    const r = await resolveAttribution({
      refCode: null,
      namedEducatorText: "aisha rahman",
      serviceId: "svc-1",
    });
    expect(r).toMatchObject({
      creditedEducatorId: "u-aisha",
      attributionSource: "form_field",
      attributionConflict: false,
    });
  });

  it("unique first-name match resolves", async () => {
    const r = await resolveAttribution({
      refCode: null,
      namedEducatorText: "Bilal",
      serviceId: "svc-1",
    });
    expect(r.creditedEducatorId).toBe("u-bilal");
  });

  it("ambiguous first-name match resolves to nobody", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      ...STAFF,
      { id: "u-bilal2", name: "Bilal Yusuf" },
    ]);
    const r = await resolveAttribution({
      refCode: null,
      namedEducatorText: "Bilal",
      serviceId: "svc-1",
    });
    expect(r.creditedEducatorId).toBeNull();
    expect(r.attributionSource).toBe("unknown");
  });

  it("both signals agreeing → both, credited, no conflict", async () => {
    mockRefCode("ABC234", "u-aisha");
    const r = await resolveAttribution({
      refCode: "ABC234",
      namedEducatorText: "Aisha Rahman",
      serviceId: "svc-1",
    });
    expect(r).toMatchObject({
      creditedEducatorId: "u-aisha",
      attributionSource: "both",
      attributionConflict: false,
    });
  });

  it("both signals disagreeing → conflict, NOBODY silently credited", async () => {
    mockRefCode("ABC234", "u-aisha");
    const r = await resolveAttribution({
      refCode: "ABC234",
      namedEducatorText: "Bilal Khan",
      serviceId: "svc-1",
    });
    expect(r).toMatchObject({
      creditedEducatorId: null,
      attributionSource: "both",
      attributionConflict: true,
    });
    expect(r.candidateIds).toEqual(["u-aisha", "u-bilal"]);
  });

  it("neither signal → unknown, uncredited", async () => {
    const r = await resolveAttribution({
      refCode: null,
      namedEducatorText: null,
      serviceId: "svc-1",
    });
    expect(r).toMatchObject({
      creditedEducatorId: null,
      attributionSource: "unknown",
      attributionConflict: false,
    });
  });

  it("inactive ref code does not credit", async () => {
    prismaMock.educatorRefCode.findUnique.mockResolvedValue({
      code: "ABC234",
      active: false,
      user: { id: "u-aisha", active: true },
    });
    const r = await resolveAttribution({
      refCode: "ABC234",
      namedEducatorText: null,
      serviceId: "svc-1",
    });
    expect(r.creditedEducatorId).toBeNull();
  });
});

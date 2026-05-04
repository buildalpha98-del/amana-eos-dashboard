import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { resolveTemplateData } from "@/lib/contract-templates/resolve-data";
import type { ContractMetaInput } from "@/lib/contract-templates/resolve-data";

const BASE_META: ContractMetaInput = {
  contractType: "ct_part_time",
  awardLevel: "director",
  awardLevelCustom: null,
  payRate: 32.5,
  hoursPerWeek: 38,
  startDate: new Date("2026-02-01"),
  endDate: null,
  position: "Director of Service",
};

const FULL_USER = {
  id: "user-1",
  name: "Sarah Doe",
  email: "sarah.doe@example.com",
  phone: "0400 000 000",
  addressStreet: "12 Example Street",
  addressSuburb: "Bonnyrigg",
  addressState: "NSW",
  addressPostcode: "2177",
  serviceId: "svc-1",
  service: {
    id: "svc-1",
    name: "Bonnyrigg OSHC",
    address: "1 School Lane",
    suburb: "Bonnyrigg",
    state: "NSW",
    postcode: "2177",
    managerId: "mgr-1",
    manager: {
      id: "mgr-1",
      name: "Daniel Khoury",
    },
  },
};

beforeEach(() => {
  prismaMock.user.findUnique.mockReset();
});

describe("resolveTemplateData", () => {
  it("happy path: all fields present — no missing blocking keys", async () => {
    prismaMock.user.findUnique.mockResolvedValue(FULL_USER);

    const { resolved, missingBlocking } = await resolveTemplateData({
      userId: "user-1",
      contractMeta: BASE_META,
    });

    expect(missingBlocking).toHaveLength(0);

    expect(resolved["staff.firstName"]).toBe("Sarah");
    expect(resolved["staff.lastName"]).toBe("Doe");
    expect(resolved["staff.fullName"]).toBe("Sarah Doe");
    expect(resolved["staff.email"]).toBe("sarah.doe@example.com");
    expect(resolved["service.name"]).toBe("Bonnyrigg OSHC");
    expect(resolved["service.entityName"]).toBe("Amana OSHC Pty Ltd");
    expect(resolved["manager.fullName"]).toBe("Daniel Khoury");
    expect(resolved["contract.payRate"]).toBe("$32.50");
    expect(resolved["contract.hoursPerWeek"]).toBe("38");
    expect(resolved["contract.position"]).toBe("Director of Service");
  });

  it("missing User.addressStreet → staff.address in missingBlocking", async () => {
    const userWithoutAddress = { ...FULL_USER, addressStreet: null };
    prismaMock.user.findUnique.mockResolvedValue(userWithoutAddress);

    const { resolved, missingBlocking } = await resolveTemplateData({
      userId: "user-1",
      contractMeta: BASE_META,
    });

    expect(missingBlocking).toContain("staff.address");
    expect(resolved["staff.address"]).toBe("");
  });

  it("no manager → manager keys resolve to empty string, NOT in missingBlocking", async () => {
    const userNoManager = {
      ...FULL_USER,
      service: { ...FULL_USER.service, managerId: null, manager: null },
    };
    prismaMock.user.findUnique.mockResolvedValue(userNoManager);

    const { resolved, missingBlocking } = await resolveTemplateData({
      userId: "user-1",
      contractMeta: BASE_META,
    });

    expect(resolved["manager.firstName"]).toBe("");
    expect(resolved["manager.lastName"]).toBe("");
    expect(resolved["manager.fullName"]).toBe("");
    expect(missingBlocking).not.toContain("manager.firstName");
    expect(missingBlocking).not.toContain("manager.fullName");
  });

  it("date formatting: startDate 2026-02-01 → '1 February 2026'", async () => {
    prismaMock.user.findUnique.mockResolvedValue(FULL_USER);

    const { resolved } = await resolveTemplateData({
      userId: "user-1",
      contractMeta: { ...BASE_META, startDate: new Date("2026-02-01") },
    });

    expect(resolved["contract.startDate"]).toBe("1 February 2026");
  });

  it("pay rate formatting: 32.5 → '$32.50'", async () => {
    prismaMock.user.findUnique.mockResolvedValue(FULL_USER);

    const { resolved } = await resolveTemplateData({
      userId: "user-1",
      contractMeta: { ...BASE_META, payRate: 32.5 },
    });

    expect(resolved["contract.payRate"]).toBe("$32.50");
  });

  it("contract type mapping: ct_part_time → 'Part-Time'", async () => {
    prismaMock.user.findUnique.mockResolvedValue(FULL_USER);

    const { resolved } = await resolveTemplateData({
      userId: "user-1",
      contractMeta: { ...BASE_META, contractType: "ct_part_time" },
    });

    expect(resolved["contract.contractType"]).toBe("Part-Time");
  });
});

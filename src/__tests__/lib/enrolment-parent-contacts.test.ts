import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import {
  upsertParentContact,
  upsertContactsFromSubmission,
} from "@/lib/enrolment-parent-contacts";

describe("upsertParentContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when email missing", async () => {
    const result = await upsertParentContact(prismaMock, {
      blob: { firstName: "X" },
      serviceId: "s1",
      enrolmentId: "e1",
      role: "primary",
    });
    expect(result).toBeNull();
    expect(prismaMock.centreContact.create).not.toHaveBeenCalled();
  });

  it("creates new CentreContact when none exists", async () => {
    prismaMock.centreContact.findFirst.mockResolvedValue(null);
    prismaMock.centreContact.create.mockResolvedValue({ id: "cc-new" });

    const result = await upsertParentContact(prismaMock, {
      blob: {
        firstName: "Jayden",
        surname: "Kowaider",
        email: "JAYDEN@EXAMPLE.COM",
        mobile: "0400000000",
        crn: "555123456A",
        dob: "1990-01-15",
        relationship: "Father",
        address: { street: "1 Main", suburb: "Fitzroy", state: "VIC", postcode: "3065" },
      },
      serviceId: "s1",
      enrolmentId: "e1",
      role: "primary",
    });

    expect(result).toEqual({
      id: "cc-new",
      email: "jayden@example.com",
      role: "primary",
      created: true,
    });
    const call = prismaMock.centreContact.create.mock.calls[0][0];
    expect(call.data.email).toBe("jayden@example.com");
    expect(call.data.crn).toBe("555123456A");
    expect(call.data.address).toEqual({
      street: "1 Main",
      suburb: "Fitzroy",
      state: "VIC",
      postcode: "3065",
    });
    expect(call.data.dob).toBeInstanceOf(Date);
    expect(call.data.parentRole).toBe("primary");
    expect(call.data.sourceEnrolmentId).toBe("e1");
  });

  it("updates existing CentreContact when email+service match", async () => {
    prismaMock.centreContact.findFirst.mockResolvedValue({ id: "cc-existing" });
    prismaMock.centreContact.update.mockResolvedValue({ id: "cc-existing" });

    const result = await upsertParentContact(prismaMock, {
      blob: { email: "jayden@example.com", firstName: "Jayden" },
      serviceId: "s1",
      enrolmentId: "e1",
      role: "primary",
    });

    expect(result).toEqual({
      id: "cc-existing",
      email: "jayden@example.com",
      role: "primary",
      created: false,
    });
    expect(prismaMock.centreContact.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cc-existing" } }),
    );
    expect(prismaMock.centreContact.create).not.toHaveBeenCalled();
  });

  it("drops empty address fields", async () => {
    prismaMock.centreContact.findFirst.mockResolvedValue(null);
    prismaMock.centreContact.create.mockResolvedValue({ id: "cc" });
    await upsertParentContact(prismaMock, {
      blob: { email: "x@y.com", address: { street: "", suburb: "  " } },
      serviceId: "s1",
      enrolmentId: "e1",
      role: "primary",
    });
    const call = prismaMock.centreContact.create.mock.calls[0][0];
    expect(call.data.address).toBeUndefined();
  });

  it("ignores invalid DOB strings", async () => {
    prismaMock.centreContact.findFirst.mockResolvedValue(null);
    prismaMock.centreContact.create.mockResolvedValue({ id: "cc" });
    await upsertParentContact(prismaMock, {
      blob: { email: "x@y.com", dob: "not-a-date" },
      serviceId: "s1",
      enrolmentId: "e1",
      role: "primary",
    });
    const call = prismaMock.centreContact.create.mock.calls[0][0];
    expect(call.data.dob).toBeNull();
  });
});

describe("upsertContactsFromSubmission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { null, null } when serviceId missing", async () => {
    const result = await upsertContactsFromSubmission(prismaMock, {
      id: "e1",
      serviceId: null,
      primaryParent: { email: "x@y.com" },
      secondaryParent: null,
    });
    expect(result).toEqual({ primary: null, secondary: null });
  });

  it("upserts primary + null for missing secondary", async () => {
    prismaMock.centreContact.findFirst.mockResolvedValue(null);
    prismaMock.centreContact.create.mockResolvedValue({ id: "cc-p" });

    const result = await upsertContactsFromSubmission(prismaMock, {
      id: "e1",
      serviceId: "s1",
      primaryParent: { email: "p@y.com" },
      secondaryParent: null,
    });
    expect(result.primary?.email).toBe("p@y.com");
    expect(result.secondary).toBeNull();
  });

  it("upserts both primary and secondary", async () => {
    prismaMock.centreContact.findFirst.mockResolvedValue(null);
    prismaMock.centreContact.create
      .mockResolvedValueOnce({ id: "cc-p" })
      .mockResolvedValueOnce({ id: "cc-s" });

    const result = await upsertContactsFromSubmission(prismaMock, {
      id: "e1",
      serviceId: "s1",
      primaryParent: { email: "p@y.com" },
      secondaryParent: { email: "s@y.com" },
    });
    expect(result.primary?.id).toBe("cc-p");
    expect(result.secondary?.id).toBe("cc-s");
  });
});

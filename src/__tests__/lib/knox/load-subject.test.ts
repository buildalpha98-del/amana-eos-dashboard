import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { loadSubject } from "@/lib/knox/load-subject";

const service = { id: "svc-1", name: "Arkana OSHC", state: "NSW", managerId: "u-dir" };

beforeEach(() => {
  prismaMock.incidentRecord.findUnique.mockReset();
  prismaMock.complaintRecord.findUnique.mockReset();
  prismaMock.staffIncidentReport.findUnique.mockReset();
});

describe("loadSubject", () => {
  it("incident: selects the service and keeps only the FIRST token of childName", async () => {
    prismaMock.incidentRecord.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
      args.where.id === "inc-1"
        ? { id: "inc-1", serviceId: "svc-1", childName: "  Ali  Ibrahim Hassan ", deleted: false, service }
        : null,
    );
    const s = await loadSubject(prismaMock, "incident", "inc-1");
    expect(s).not.toBeNull();
    expect(s!.type).toBe("incident");
    if (s!.type !== "incident") throw new Error("unreachable");
    expect(s!.childFirstName).toBe("Ali");
    expect(s!.service).toEqual(service);
    expect(s!.record).not.toHaveProperty("service");
    expect(prismaMock.incidentRecord.findUnique).toHaveBeenCalledWith({
      where: { id: "inc-1" },
      include: { service: { select: { id: true, name: true, state: true, managerId: true } } },
    });
  });

  it("incident: a 'Surname, First' childName yields the FIRST name, not the surname", async () => {
    prismaMock.incidentRecord.findUnique.mockImplementation(async () => ({
      id: "inc-3",
      childName: "Hassan, Omar",
      deleted: false,
      service,
    }));
    const s = await loadSubject(prismaMock, "incident", "inc-3");
    expect(s && s.type === "incident" ? s.childFirstName : "x").toBe("Omar");
  });

  it("incident: blank or missing childName → childFirstName null", async () => {
    prismaMock.incidentRecord.findUnique.mockImplementation(async () => ({
      id: "inc-2",
      childName: "   ",
      deleted: false,
      service,
    }));
    const s = await loadSubject(prismaMock, "incident", "inc-2");
    expect(s && s.type === "incident" ? s.childFirstName : "x").toBeNull();
  });

  it("incident: deleted → null; missing → null", async () => {
    prismaMock.incidentRecord.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
      args.where.id === "gone" ? { id: "gone", childName: "Ali", deleted: true, service } : null,
    );
    expect(await loadSubject(prismaMock, "incident", "gone")).toBeNull();
    expect(await loadSubject(prismaMock, "incident", "nope")).toBeNull();
  });

  it("complaint and staff_incident load with their service; missing → null", async () => {
    prismaMock.complaintRecord.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
      args.where.id === "c-1" ? { id: "c-1", service } : null,
    );
    prismaMock.staffIncidentReport.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
      args.where.id === "s-1" ? { id: "s-1", service } : null,
    );
    const c = await loadSubject(prismaMock, "complaint", "c-1");
    expect(c?.type).toBe("complaint");
    expect(c?.service).toEqual(service);
    const st = await loadSubject(prismaMock, "staff_incident", "s-1");
    expect(st?.type).toBe("staff_incident");
    expect(st?.record).toEqual({ id: "s-1" });
    expect(await loadSubject(prismaMock, "complaint", "c-x")).toBeNull();
    expect(await loadSubject(prismaMock, "staff_incident", "s-x")).toBeNull();
  });
});

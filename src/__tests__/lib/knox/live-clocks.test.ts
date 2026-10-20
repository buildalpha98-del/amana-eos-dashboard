import { describe, it, expect, beforeEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";
import { liveClocksFor } from "@/lib/knox/live-clocks";

const NOW = new Date("2026-10-20T04:00:00Z");
const service = { id: "svc-1", name: "Arkana OSHC", state: "NSW", managerId: null };

function incident(over: Record<string, unknown>) {
  prismaMock.incidentRecord.findUnique.mockImplementation((args: { where: { id: string } }) =>
    Promise.resolve(
      args.where.id === "inc-1"
        ? {
            id: "inc-1",
            serviceId: "svc-1",
            incidentDate: new Date("2026-10-20T01:00:00Z"),
            incidentType: "injury",
            severity: "serious",
            reportableToAuthority: true,
            seriousIncidentCategory: "serious_injury",
            ambulanceCalled: true,
            medicalPersonnelContacted: null,
            parentNotified: false,
            reportedToAuthorityAt: null,
            becameAwareAt: new Date("2026-10-20T01:00:00Z"),
            createdAt: new Date("2026-10-20T01:05:00Z"),
            deleted: false,
            childName: "Ali Smith",
            service,
            ...over,
          }
        : null,
    ),
  );
}

describe("liveClocksFor", () => {
  beforeEach(() => {
    prismaMock.incidentRecord.findUnique.mockReset();
  });

  it("recomputes the clocks from the record as it stands now", async () => {
    incident({});
    const kinds = (await liveClocksFor(prismaMock as never, "incident", "inc-1", NOW)).map((c) => c.kind);
    expect(kinds.sort()).toEqual(["parent_24h", "regulator"]);
  });

  it("drops a clock once its duty is met (parent told, regulator told)", async () => {
    incident({ parentNotified: true, reportedToAuthorityAt: new Date("2026-10-20T03:00:00Z") });
    expect(await liveClocksFor(prismaMock as never, "incident", "inc-1", NOW)).toEqual([]);
  });

  it("is empty when the record is gone or soft-deleted", async () => {
    incident({ deleted: true });
    expect(await liveClocksFor(prismaMock as never, "incident", "inc-1", NOW)).toEqual([]);
    expect(await liveClocksFor(prismaMock as never, "incident", "missing", NOW)).toEqual([]);
  });
});

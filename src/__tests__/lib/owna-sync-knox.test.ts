import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/knox/trigger", () => ({
  triggerTriage: vi.fn(),
}));

import { syncOwnaService } from "@/lib/owna-sync";
import { triggerTriage } from "@/lib/knox/trigger";
import type { OwnaClient, OwnaIncident } from "@/lib/owna";

function ownaIncident(overrides: Partial<OwnaIncident> = {}): OwnaIncident {
  return {
    id: "owna-i1",
    child: "Alice",
    incidentDate: "2026-10-18 03:30 PM",
    location: "Playground",
    injurytrauma: "Scraped knee",
    illness: "",
    missing: "",
    actionTaken: "First aid",
    emergencyServices: false,
    medicalAttention: false,
    parentNotifiedDatetime: "",
    ...overrides,
  } as OwnaIncident;
}

function ownaClient(incidents: OwnaIncident[]): OwnaClient {
  return {
    getChildren: vi.fn().mockResolvedValue([]),
    getAttendance: vi.fn().mockResolvedValue([]),
    getEnquiries: vi.fn().mockResolvedValue([]),
    getIncidents: vi.fn().mockResolvedValue(incidents),
  } as unknown as OwnaClient;
}

type Existing = {
  id: string;
  ownaIncidentId: string;
  severity: string;
  incidentType: string;
  reportableToAuthority: boolean;
};

/**
 * Input-routed findMany:
 *  - pre-fetch (ownaIncidentId IN, selects severity) -> `existing`
 *  - post-createMany re-read (ownaIncidentId IN, no severity select) -> `created`
 */
function routeIncidentFindMany(opts: {
  existing?: Existing[];
  created?: Array<{ id: string; serviceId: string }>;
}) {
  prismaMock.incidentRecord.findMany.mockImplementation(((args: {
    select?: Record<string, unknown>;
  }) => {
    if (args?.select?.severity) return Promise.resolve(opts.existing ?? []);
    return Promise.resolve(opts.created ?? []);
  }) as never);
}

const run = (incidents: OwnaIncident[]) =>
  syncOwnaService("owna-svc-1", "svc-1", "MFIS-GA", ownaClient(incidents));

describe("OWNA incident sync — Knox severity ratchet and triggers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.incidentRecord.createMany.mockResolvedValue({ count: 1 });
    prismaMock.incidentRecord.update.mockReturnValue({} as never);
    prismaMock.$transaction.mockResolvedValue([]);
    prismaMock.service.update.mockResolvedValue({} as never);
  });

  it("update keeps the higher severity (existing serious, mapped moderate -> serious)", async () => {
    routeIncidentFindMany({
      existing: [
        { id: "inc-1", ownaIncidentId: "owna-i1", severity: "serious", incidentType: "injury", reportableToAuthority: false },
      ],
    });

    await run([ownaIncident({ medicalAttention: true })]); // maps to moderate

    expect(prismaMock.incidentRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inc-1" },
        data: expect.objectContaining({ severity: "serious" }),
      }),
    );
  });

  it("update raises severity when OWNA maps higher (existing minor, mapped serious -> serious)", async () => {
    routeIncidentFindMany({
      existing: [
        { id: "inc-1", ownaIncidentId: "owna-i1", severity: "minor", incidentType: "injury", reportableToAuthority: false },
      ],
    });

    await run([ownaIncident({ emergencyServices: true })]);

    expect(prismaMock.incidentRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ severity: "serious" }) }),
    );
  });

  it("update never sets reportableToAuthority from true to false", async () => {
    routeIncidentFindMany({
      existing: [
        { id: "inc-1", ownaIncidentId: "owna-i1", severity: "reportable", incidentType: "injury", reportableToAuthority: true },
      ],
    });

    await run([ownaIncident({ emergencyServices: false })]);

    const call = prismaMock.incidentRecord.update.mock.calls[0][0] as {
      data: { reportableToAuthority: boolean; severity: string };
    };
    expect(call.data.reportableToAuthority).toBe(true);
    expect(call.data.severity).toBe("reportable");
  });

  it("update still sets reportableToAuthority true when OWNA says emergency services", async () => {
    routeIncidentFindMany({
      existing: [
        { id: "inc-1", ownaIncidentId: "owna-i1", severity: "minor", incidentType: "injury", reportableToAuthority: false },
      ],
    });

    await run([ownaIncident({ emergencyServices: true })]);

    const call = prismaMock.incidentRecord.update.mock.calls[0][0] as {
      data: { reportableToAuthority: boolean };
    };
    expect(call.data.reportableToAuthority).toBe(true);
  });

  it("new incidents are re-read by ownaIncidentId after createMany and enqueued reason 'created' (no immediate)", async () => {
    routeIncidentFindMany({ created: [{ id: "inc-new", serviceId: "svc-1" }] });

    await run([ownaIncident()]);

    expect(prismaMock.incidentRecord.createMany).toHaveBeenCalledOnce();
    expect(prismaMock.incidentRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownaIncidentId: { in: ["owna-i1"] } },
        select: { id: true, serviceId: true },
      }),
    );
    expect(triggerTriage).toHaveBeenCalledTimes(1);
    expect(triggerTriage).toHaveBeenCalledWith({
      subjectType: "incident",
      subjectId: "inc-new",
      serviceId: "svc-1",
      reason: "created",
    });
  });

  it("changed incidents are enqueued 'updated' when mapped severity rose", async () => {
    routeIncidentFindMany({
      existing: [
        { id: "inc-1", ownaIncidentId: "owna-i1", severity: "minor", incidentType: "injury", reportableToAuthority: false },
      ],
    });

    await run([ownaIncident({ emergencyServices: true })]);

    expect(triggerTriage).toHaveBeenCalledWith({
      subjectType: "incident",
      subjectId: "inc-1",
      serviceId: "svc-1",
      reason: "updated",
    });
  });

  it("changed incidents are enqueued 'updated' when the mapped type differs", async () => {
    routeIncidentFindMany({
      existing: [
        { id: "inc-1", ownaIncidentId: "owna-i1", severity: "minor", incidentType: "injury", reportableToAuthority: false },
      ],
    });

    await run([ownaIncident({ injurytrauma: "", illness: "Fever" })]); // illness, minor

    expect(triggerTriage).toHaveBeenCalledWith(
      expect.objectContaining({ subjectId: "inc-1", reason: "updated" }),
    );
  });

  it("does not enqueue an update when severity is equal or lower and the type is unchanged", async () => {
    routeIncidentFindMany({
      existing: [
        { id: "inc-1", ownaIncidentId: "owna-i1", severity: "serious", incidentType: "injury", reportableToAuthority: false },
      ],
    });

    await run([ownaIncident({ medicalAttention: true })]); // moderate < serious, same type

    expect(triggerTriage).not.toHaveBeenCalled();
  });
});

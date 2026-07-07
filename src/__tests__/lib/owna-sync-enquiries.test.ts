import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    withRequestId: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  generateRequestId: () => "test-req-id",
}));

vi.mock("@/lib/nurture-scheduler", () => ({
  scheduleNurtureFromStageChange: vi.fn().mockResolvedValue(undefined),
}));

import { syncOwnaService } from "@/lib/owna-sync";
import { scheduleNurtureFromStageChange } from "@/lib/nurture-scheduler";
import type { OwnaClient, OwnaEnquiry } from "@/lib/owna";

const NOW = new Date("2026-07-07T10:00:00Z");
const RECENT = "2026-07-05"; // 2 days ago
const STALE = "2026-05-01"; // months ago — backfill, never auto-nurture

function ownaEnquiry(overrides: Partial<OwnaEnquiry> = {}): OwnaEnquiry {
  return {
    id: "owna-e1",
    centreid: "c1",
    centre: "Centre A",
    firstname: "Jane",
    surname: "Doe",
    phone: "0400 000 000",
    email: "jane@test.com",
    enquiry: "Looking for ASC",
    child1: "Jimmy",
    child1Dob: "",
    child2: "",
    child2Dob: "",
    startdate: "",
    notes: null,
    lastupdated: null,
    staffassigned: null,
    status: null,
    unsubscribe: null,
    tourbookingid: null,
    archived: null,
    dateAdded: RECENT,
    ...overrides,
  } as OwnaEnquiry;
}

/** OWNA client stub: every entity empty except the enquiries under test. */
function ownaClient(enquiries: OwnaEnquiry[]): OwnaClient {
  return {
    getChildren: vi.fn().mockResolvedValue([]),
    getAttendance: vi.fn().mockResolvedValue([]),
    getEnquiries: vi.fn().mockResolvedValue(enquiries),
    getIncidents: vi.fn().mockResolvedValue([]),
  } as unknown as OwnaClient;
}

/**
 * Input-routed findMany:
 *  - lookup of already-linked enquiries (ownaEnquiryId IN, selects stageChangedAt)
 *  - lookup of open unlinked cards from other channels (ownaEnquiryId: null)
 *  - post-create fetch for nurture enrolment (ownaEnquiryId IN, selects id+stage)
 */
function routeFindMany(opts: {
  linked?: Array<Record<string, unknown>>;
  unlinked?: Array<Record<string, unknown>>;
  created?: Array<Record<string, unknown>>;
}) {
  prismaMock.parentEnquiry.findMany.mockImplementation(((args: {
    where?: { ownaEnquiryId?: unknown };
    select?: Record<string, unknown>;
  }) => {
    if (args?.where?.ownaEnquiryId === null) return Promise.resolve(opts.unlinked ?? []);
    if (args?.select?.stageChangedAt) return Promise.resolve(opts.linked ?? []);
    return Promise.resolve(opts.created ?? []);
  }) as never);
}

async function runSync(enquiries: OwnaEnquiry[]) {
  return syncOwnaService("owna-svc-1", "svc-1", "MFIS-GA", ownaClient(enquiries));
}

describe("OWNA enquiry sync — nurture automation + email matching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(NOW);
    routeFindMany({});
    prismaMock.parentEnquiry.createMany.mockResolvedValue({ count: 1 });
    prismaMock.parentEnquiry.update.mockReturnValue({} as never);
    prismaMock.$transaction.mockResolvedValue([]);
    prismaMock.service.update.mockResolvedValue({} as never);
  });

  it("creates new OWNA enquiries with channel 'owna' and enrols recent ones in nurture", async () => {
    routeFindMany({ created: [{ id: "enq-db-1", stage: "new_enquiry" }] });

    await runSync([ownaEnquiry()]);

    expect(prismaMock.parentEnquiry.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ ownaEnquiryId: "owna-e1", channel: "owna", stage: "new_enquiry" })],
      }),
    );
    expect(scheduleNurtureFromStageChange).toHaveBeenCalledWith("enq-db-1", "new_enquiry");
  });

  it("does not auto-nurture historical backfill (dateAdded older than 7 days)", async () => {
    await runSync([ownaEnquiry({ dateAdded: STALE })]);

    expect(prismaMock.parentEnquiry.createMany).toHaveBeenCalledTimes(1);
    expect(scheduleNurtureFromStageChange).not.toHaveBeenCalled();
  });

  it("does not auto-nurture enquiries flagged unsubscribe in OWNA", async () => {
    await runSync([ownaEnquiry({ unsubscribe: true })]);

    expect(scheduleNurtureFromStageChange).not.toHaveBeenCalled();
  });

  it("links an OWNA enquiry to an open card with the same email instead of duplicating", async () => {
    routeFindMany({
      unlinked: [{ id: "web-enq-1", parentEmail: "Jane@Test.com", stage: "new_enquiry" }],
    });

    await runSync([ownaEnquiry({ status: "enrolled" })]);

    expect(prismaMock.parentEnquiry.createMany).not.toHaveBeenCalled();
    expect(prismaMock.parentEnquiry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "web-enq-1" },
        data: expect.objectContaining({
          ownaEnquiryId: "owna-e1",
          stage: "enrolled",
          formCompleted: true,
        }),
      }),
    );
    expect(scheduleNurtureFromStageChange).toHaveBeenCalledWith("web-enq-1", "enrolled");
  });

  it("links by email without regressing a card that is further along", async () => {
    routeFindMany({
      unlinked: [{ id: "web-enq-1", parentEmail: "jane@test.com", stage: "form_started" }],
    });

    await runSync([ownaEnquiry({ status: null })]); // maps to new_enquiry — behind form_started

    const updateData = prismaMock.parentEnquiry.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(updateData.data.ownaEnquiryId).toBe("owna-e1");
    expect(updateData.data.stage).toBeUndefined();
    expect(scheduleNurtureFromStageChange).not.toHaveBeenCalled();
  });

  it("schedules nurture side effects when OWNA advances an untouched card's stage", async () => {
    routeFindMany({
      linked: [{
        id: "enq-db-1",
        ownaEnquiryId: "owna-e1",
        stage: "new_enquiry",
        stageChangedAt: new Date("2026-07-01T00:00:00Z"),
        createdAt: new Date("2026-07-01T00:00:00Z"),
      }],
    });

    await runSync([ownaEnquiry({ status: "tour booked" })]); // → nurturing

    expect(scheduleNurtureFromStageChange).toHaveBeenCalledWith("enq-db-1", "nurturing");
  });

  it("applies OWNA 'enrolled' even over manual pipeline moves (ground truth)", async () => {
    routeFindMany({
      linked: [{
        id: "enq-db-1",
        ownaEnquiryId: "owna-e1",
        stage: "nurturing",
        // stageChangedAt well after createdAt = manually moved by staff
        stageChangedAt: new Date("2026-07-03T00:00:00Z"),
        createdAt: new Date("2026-07-01T00:00:00Z"),
      }],
    });

    await runSync([ownaEnquiry({ status: "enrolled" })]);

    expect(prismaMock.parentEnquiry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownaEnquiryId: "owna-e1" },
        data: expect.objectContaining({ stage: "enrolled", formCompleted: true }),
      }),
    );
    expect(scheduleNurtureFromStageChange).toHaveBeenCalledWith("enq-db-1", "enrolled");
  });

  it("still respects manual moves for non-enrolled OWNA statuses", async () => {
    routeFindMany({
      linked: [{
        id: "enq-db-1",
        ownaEnquiryId: "owna-e1",
        stage: "form_started",
        stageChangedAt: new Date("2026-07-03T00:00:00Z"),
        createdAt: new Date("2026-07-01T00:00:00Z"),
      }],
    });

    await runSync([ownaEnquiry({ status: "tour booked" })]);

    expect(prismaMock.parentEnquiry.update).not.toHaveBeenCalled();
    expect(scheduleNurtureFromStageChange).not.toHaveBeenCalled();
  });

  it("never regresses a first_session card even when OWNA says enrolled", async () => {
    routeFindMany({
      linked: [{
        id: "enq-db-1",
        ownaEnquiryId: "owna-e1",
        stage: "first_session",
        stageChangedAt: new Date("2026-07-03T00:00:00Z"),
        createdAt: new Date("2026-07-01T00:00:00Z"),
      }],
    });

    await runSync([ownaEnquiry({ status: "enrolled" })]);

    expect(prismaMock.parentEnquiry.update).not.toHaveBeenCalled();
    expect(scheduleNurtureFromStageChange).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prismaMock } from "../../helpers/prisma-mock";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { ApiError } from "@/lib/api-error";
import { updateIncidentRecord } from "@/lib/incidents/update-incident-record";
import {
  complaintPatchSchema,
  updateComplaintRecord,
} from "@/lib/complaints/update-complaint-record";

const NOW = new Date("2026-10-20T01:00:00.000Z");
const actor = { id: "user-1" };

describe("updateIncidentRecord", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prismaMock.incidentRecord.update.mockReset();
    prismaMock.incidentRecord.update.mockImplementation(async (args: { where: { id: string } }) => ({
      id: args.where.id,
    }));
  });
  afterEach(() => vi.useRealTimers());

  it("stamps sharedWithParentAt and sharedById when shareWithParent is true", async () => {
    await updateIncidentRecord(prismaMock as never, "inc-1", { shareWithParent: true }, actor);
    const args = prismaMock.incidentRecord.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: "inc-1" });
    expect(args.data).toEqual({ sharedWithParentAt: NOW, sharedById: "user-1" });
  });

  it("clears the share stamp when shareWithParent is false", async () => {
    await updateIncidentRecord(prismaMock as never, "inc-1", { shareWithParent: false }, actor);
    const args = prismaMock.incidentRecord.update.mock.calls[0][0];
    expect(args.data).toEqual({ sharedWithParentAt: null, sharedById: null });
  });

  it("maps severity and reportableToAuthority and leaves everything else out", async () => {
    await updateIncidentRecord(
      prismaMock as never,
      "inc-1",
      { severity: "serious", reportableToAuthority: true },
      actor,
    );
    const args = prismaMock.incidentRecord.update.mock.calls[0][0];
    expect(args.data).toEqual({ severity: "serious", reportableToAuthority: true });
  });

  it("stamps the actor as parentNotifiedById and keeps the legacy boolean in step", async () => {
    await updateIncidentRecord(
      prismaMock as never,
      "inc-1",
      { parentNotifiedAt: "2026-10-19T23:00:00.000Z" },
      actor,
    );
    const { data } = prismaMock.incidentRecord.update.mock.calls[0][0];
    expect(data.parentNotifiedAt).toEqual(new Date("2026-10-19T23:00:00.000Z"));
    expect(data.parentNotified).toBe(true);
    expect(data.parentNotifiedById).toBe("user-1");

    await updateIncidentRecord(prismaMock as never, "inc-1", { parentNotifiedAt: null }, actor);
    const cleared = prismaMock.incidentRecord.update.mock.calls[1][0].data;
    expect(cleared).toEqual({
      parentNotifiedAt: null,
      parentNotified: false,
      parentNotifiedById: null,
    });
  });

  it("includes service and createdBy on the returned row", async () => {
    await updateIncidentRecord(prismaMock as never, "inc-1", { severity: "minor" }, actor);
    const args = prismaMock.incidentRecord.update.mock.calls[0][0];
    expect(args.include).toEqual({
      service: { select: { id: true, name: true, code: true } },
      createdBy: { select: { id: true, name: true } },
    });
  });
});

describe("updateComplaintRecord", () => {
  const baseRow = {
    id: "cmp-1",
    reference: "CMP-2026-0001",
    status: "new",
    notificationDueAt: null,
    regulatorNotifiedAt: null,
    notifiable: false,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prismaMock.complaintRecord.update.mockReset();
    prismaMock.complaintRecord.update.mockImplementation(async () => baseRow);
  });
  afterEach(() => vi.useRealTimers());

  it("throws ApiError.badRequest when becoming notifiable without a reason", async () => {
    const run = updateComplaintRecord(
      prismaMock as never,
      "cmp-1",
      { notifiable: true },
      actor,
      { notifiable: false, becameAwareAt: null },
    );
    await expect(run).rejects.toBeInstanceOf(ApiError);
    await expect(run).rejects.toMatchObject({ status: 400 });
    expect(prismaMock.complaintRecord.update).not.toHaveBeenCalled();
  });

  it("stamps notificationDueAt = becameAwareAt + 24h when becoming notifiable and awareness is unchanged", async () => {
    const aware = new Date("2026-10-19T08:00:00.000Z");
    await updateComplaintRecord(
      prismaMock as never,
      "cmp-1",
      { notifiable: true, notifiableReason: "serious_incident" },
      actor,
      { notifiable: false, becameAwareAt: aware },
    );
    const { data } = prismaMock.complaintRecord.update.mock.calls[0][0];
    expect(data.notifiable).toBe(true);
    expect(data.notifiableReason).toBe("serious_incident");
    expect(data.notificationDueAt).toEqual(new Date("2026-10-20T08:00:00.000Z"));
    expect(data.becameAwareAt).toBeUndefined();
  });

  it("falls back to now + 24h when becoming notifiable with no awareness date on file", async () => {
    await updateComplaintRecord(
      prismaMock as never,
      "cmp-1",
      { notifiable: true, notifiableReason: "law_contravention" },
      actor,
      { notifiable: false, becameAwareAt: null },
    );
    const { data } = prismaMock.complaintRecord.update.mock.calls[0][0];
    expect(data.notificationDueAt).toEqual(new Date(NOW.getTime() + 24 * 3600_000));
  });

  it("does not re-stamp the deadline on an unrelated save", async () => {
    await updateComplaintRecord(prismaMock as never, "cmp-1", { outcome: "Resolved with family" }, actor, {
      notifiable: true,
      becameAwareAt: new Date("2026-10-19T08:00:00.000Z"),
    });
    const { data } = prismaMock.complaintRecord.update.mock.calls[0][0];
    expect("notificationDueAt" in data).toBe(false);
  });

  it("rejects an awareness date that is not a real date", async () => {
    await expect(
      updateComplaintRecord(prismaMock as never, "cmp-1", { becameAwareAt: "not-a-date" }, actor, {
        notifiable: false,
        becameAwareAt: null,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(prismaMock.complaintRecord.update).not.toHaveBeenCalled();
  });

  it("clears the deadline when awareness is cleared", async () => {
    await updateComplaintRecord(prismaMock as never, "cmp-1", { becameAwareAt: null }, actor, {
      notifiable: true,
      becameAwareAt: new Date("2026-10-19T08:00:00.000Z"),
    });
    const { data } = prismaMock.complaintRecord.update.mock.calls[0][0];
    expect(data.becameAwareAt).toBeNull();
    expect(data.notificationDueAt).toBeNull();
  });

  it("stamps resolvedAt and resolvedById when resolving or closing", async () => {
    for (const status of ["resolved", "closed"] as const) {
      prismaMock.complaintRecord.update.mockClear();
      await updateComplaintRecord(prismaMock as never, "cmp-1", { status }, actor, {
        notifiable: false,
        becameAwareAt: null,
      });
      const { data } = prismaMock.complaintRecord.update.mock.calls[0][0];
      expect(data).toEqual({ status, resolvedAt: NOW, resolvedById: "user-1" });
    }
  });

  it("does not stamp a resolver for other statuses", async () => {
    await updateComplaintRecord(prismaMock as never, "cmp-1", { status: "investigating" }, actor, {
      notifiable: false,
      becameAwareAt: null,
    });
    const { data } = prismaMock.complaintRecord.update.mock.calls[0][0];
    expect(data).toEqual({ status: "investigating" });
  });

  it("exports a schema that rejects an unknown notifiable reason", () => {
    expect(complaintPatchSchema.safeParse({ notifiableReason: "nonsense" }).success).toBe(false);
    expect(complaintPatchSchema.safeParse({ notifiableReason: "serious_incident" }).success).toBe(true);
  });
});

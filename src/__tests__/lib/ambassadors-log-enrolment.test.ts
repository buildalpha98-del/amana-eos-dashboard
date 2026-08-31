import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import {
  logAmbassadorEnrolmentForChild,
  logAmbassadorEnrolments,
} from "@/lib/ambassadors/log-enrolment";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const CHILD = {
  id: "child-1",
  firstName: "Zainab",
  surname: "Ali",
  dob: d("2019-03-14"),
  serviceId: "svc-pilot",
};

function mockSubmission(overrides: Record<string, unknown> = {}) {
  prismaMock.enrolmentSubmission.findUnique.mockResolvedValue({
    id: "sub-1",
    createdAt: d("2026-08-20"), // inside window
    referralEducatorName: null,
    primaryParent: { email: "Parent@Example.com" },
    childRecords: [CHILD],
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Active pilot centre for svc-pilot only.
  prismaMock.ambassadorPilotCentre.findFirst.mockImplementation(
    async ({ where }: { where: { serviceId: string } }) =>
      where.serviceId === "svc-pilot" ? { pilotId: "pilot-1" } : null,
  );
  prismaMock.ambassadorEnrolment.findFirst.mockResolvedValue(null); // no dupe
  prismaMock.ambassadorEnrolment.create.mockResolvedValue({ id: "rec-1" });
  prismaMock.parentAccount.findUnique.mockResolvedValue({ ambassadorRefCode: null });
  // attribution + new-child dependencies
  prismaMock.educatorRefCode.findUnique.mockResolvedValue(null);
  prismaMock.user.findMany.mockResolvedValue([]);
  prismaMock.child.findMany.mockResolvedValue([]);
  prismaMock.attendanceRecord.count.mockResolvedValue(0);
  prismaMock.booking.count.mockResolvedValue(0);
  // recompute dependencies
  prismaMock.ambassadorEnrolment.findUnique.mockResolvedValue(null);
});

describe("logAmbassadorEnrolments", () => {
  it("creates one logged record per pilot-centre child with initials only", async () => {
    mockSubmission();
    await logAmbassadorEnrolments({ submissionId: "sub-1" });
    expect(prismaMock.ambassadorEnrolment.create).toHaveBeenCalledTimes(1);
    const data = prismaMock.ambassadorEnrolment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      pilotId: "pilot-1",
      serviceId: "svc-pilot",
      childId: "child-1",
      childInitials: "Z.A.",
      newChildStatus: "new_child",
    });
    // Full name never stored on the ambassador record.
    expect(JSON.stringify(data)).not.toContain("Zainab");
  });

  it("skips children whose serviceId is null (assigned later)", async () => {
    mockSubmission({ childRecords: [{ ...CHILD, serviceId: null }] });
    await logAmbassadorEnrolments({ submissionId: "sub-1" });
    expect(prismaMock.ambassadorEnrolment.create).not.toHaveBeenCalled();
  });

  it("no-ops for non-pilot centres", async () => {
    mockSubmission({ childRecords: [{ ...CHILD, serviceId: "svc-other" }] });
    await logAmbassadorEnrolments({ submissionId: "sub-1" });
    expect(prismaMock.ambassadorEnrolment.create).not.toHaveBeenCalled();
  });

  it("no-ops when there is no active pilot for the date", async () => {
    prismaMock.ambassadorPilotCentre.findFirst.mockResolvedValue(null);
    mockSubmission();
    await logAmbassadorEnrolments({ submissionId: "sub-1" });
    expect(prismaMock.ambassadorEnrolment.create).not.toHaveBeenCalled();
  });

  it("is idempotent per child", async () => {
    mockSubmission();
    prismaMock.ambassadorEnrolment.findFirst.mockResolvedValue({ id: "rec-existing" });
    await logAmbassadorEnrolments({ submissionId: "sub-1" });
    expect(prismaMock.ambassadorEnrolment.create).not.toHaveBeenCalled();
  });

  it("resolves the ref code from the parent account by lowercased email", async () => {
    mockSubmission();
    prismaMock.parentAccount.findUnique.mockResolvedValue({
      ambassadorRefCode: "ABC234",
    });
    await logAmbassadorEnrolments({ submissionId: "sub-1" });
    expect(prismaMock.parentAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "parent@example.com" } }),
    );
    const data = prismaMock.ambassadorEnrolment.create.mock.calls[0][0].data;
    expect(data.refCode).toBe("ABC234");
  });

  it("never throws — a database error is swallowed and logged", async () => {
    prismaMock.enrolmentSubmission.findUnique.mockRejectedValue(new Error("boom"));
    await expect(
      logAmbassadorEnrolments({ submissionId: "sub-1" }),
    ).resolves.toBeUndefined();
  });
});

describe("logAmbassadorEnrolmentForChild (late service assignment)", () => {
  it("uses the ORIGINAL submission date for the window check", async () => {
    prismaMock.child.findUnique.mockResolvedValue({
      ...CHILD,
      enrolmentId: "sub-1",
      enrolment: {
        id: "sub-1",
        createdAt: d("2026-08-20"),
        referralEducatorName: null,
        primaryParent: { email: "parent@example.com" },
      },
    });
    await logAmbassadorEnrolmentForChild("child-1");
    expect(prismaMock.ambassadorEnrolment.create).toHaveBeenCalledTimes(1);

    // Same child but the submission predates the pilot window → no record.
    vi.clearAllMocks();
    prismaMock.ambassadorPilotCentre.findFirst.mockImplementation(
      async ({ where }: { where: { pilot?: { startDate?: { lte: Date } } } }) => {
        const onDate = where.pilot?.startDate?.lte;
        return onDate && onDate >= d("2026-08-17") ? { pilotId: "pilot-1" } : null;
      },
    );
    prismaMock.child.findUnique.mockResolvedValue({
      ...CHILD,
      enrolmentId: "sub-1",
      enrolment: {
        id: "sub-1",
        createdAt: d("2026-08-01"),
        referralEducatorName: null,
        primaryParent: { email: "parent@example.com" },
      },
    });
    prismaMock.parentAccount.findUnique.mockResolvedValue({ ambassadorRefCode: null });
    await logAmbassadorEnrolmentForChild("child-1");
    expect(prismaMock.ambassadorEnrolment.create).not.toHaveBeenCalled();
  });
});
